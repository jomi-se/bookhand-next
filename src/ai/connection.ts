import {
  beginOpenClawAuthorization,
  completeOpenClawAuthorization,
  createAiSdkOpenResponsesModel,
  createOpenClawAccessTokenGetter,
  createOpenClawConversationClient,
  discoverOpenClawProvider,
  getOpenClawConnectionProviderUrl,
  parseOpenClawAuthorizationTransaction,
  revokeOpenClawConnection,
  serializeOpenClawAuthorizationTransaction,
  type ApplicationTool,
  type JsonObject,
  type OpenClawAuthorizationTransaction,
  type OpenClawConnection,
  type OpenClawConnectionExperience,
} from '@open-agent-connect/web'
import type { LanguageModel } from 'ai'
import type { ToolDefinition } from '../webmcp/model-context.ts'
import {
  type TutorHistoryAccess,
} from './conversation-history.ts'
import {
  AI_CONNECTION_EPOCH_KEY,
  AI_CONNECTION_KEY,
  AI_CONNECTION_LOCK,
  AI_CONNECTION_PREFS_KEY,
  AI_REFRESH_BEFORE_MS,
  clampConnectionGrant,
  peekPersistedConnectionId,
  readAiConnectionPreferences,
  readPersistedAiConnection,
  readPersistedEpoch,
  readyRecord,
  rotatingRecord,
  writeAiConnectionPreferences,
  writePersistedAiConnection,
  writePersistedEpoch,
  type PersistedAiConnectionReady,
} from './connection-persistence.ts'
import {
  AI_PENDING_AUTHORIZATION_KEY,
  isStrictAuthorizationCallback,
  ownsAuthorizationCallback,
  readPendingAiAuthorization,
  stripOwnedAuthorizationParameters,
  type AiFeatureIntent,
  type PendingAiAuthorization,
} from './pending-intent.ts'

export interface AiConnectionSnapshot {
  readonly phase: 'disconnected' | 'connecting' | 'connected' | 'error'
  readonly providerUrl: string
  readonly experience: 'tailscale' | 'https'
  readonly generation?: string
  readonly error?: string
}

export interface AiConnectionSdkPort {
  readonly discover: typeof discoverOpenClawProvider
  readonly beginAuthorization: typeof beginOpenClawAuthorization
  readonly completeAuthorization: typeof completeOpenClawAuthorization
  readonly serializeTransaction: typeof serializeOpenClawAuthorizationTransaction
  readonly parseTransaction: typeof parseOpenClawAuthorizationTransaction
  readonly createAccessTokenGetter: typeof createOpenClawAccessTokenGetter
  readonly revoke: typeof revokeOpenClawConnection
  readonly createModel: typeof createAiSdkOpenResponsesModel
}

export interface AiConnectionLockPort {
  request<T>(name: string, options: { readonly mode: 'exclusive' }, callback: () => T | Promise<T>): Promise<T>
}

export interface AiConnectionStorageChange { readonly key: string | null }

export interface AiConnectionPlatformPort {
  readonly sessionStorage?: Storage
  readonly localStorage?: Storage
  readonly locks?: AiConnectionLockPort
  readonly currentUrl: () => string
  readonly replaceUrl: (url: string) => void
  readonly navigate: (url: string) => void
  readonly reload: () => void
  readonly now: () => number
  readonly createGeneration: () => string
  readonly listenStorage?: (listener: (event: AiConnectionStorageChange) => void) => () => void
}

export interface AiConnectionStoreOptions {
  readonly sdk?: Partial<AiConnectionSdkPort>
  readonly platform?: Partial<AiConnectionPlatformPort>
  readonly fetch?: typeof globalThis.fetch
}

export interface AuthorizeAiConnectionOptions {
  readonly tools: readonly ToolDefinition[]
  readonly intent: AiFeatureIntent
  readonly beforeRedirect: () => Promise<void>
}

interface CurrentConnection {
  readonly generation: string
  readonly persistentId: string
  readonly epoch: string
  readonly experience: OpenClawConnectionExperience
  readonly grantExpiresAt: string
  connection: OpenClawConnection
  readonly model: LanguageModel
}

class SupersededAuthorizationError extends Error {}

const CONSUMED_MARKER_PREFIX = 'bookhand.ai.oauth.consumed.'
const MAX_CONSUMED_MARKERS = 64
const OWNED_CALLBACK_KEYS = ['state', 'code', 'error', 'error_description', 'iss'] as const

const DEFAULT_SDK: AiConnectionSdkPort = {
  discover: discoverOpenClawProvider,
  beginAuthorization: beginOpenClawAuthorization,
  completeAuthorization: completeOpenClawAuthorization,
  serializeTransaction: serializeOpenClawAuthorizationTransaction,
  parseTransaction: parseOpenClawAuthorizationTransaction,
  createAccessTokenGetter: createOpenClawAccessTokenGetter,
  revoke: revokeOpenClawConnection,
  createModel: createAiSdkOpenResponsesModel,
}

export class AiConnectionStore {
  #snapshot: AiConnectionSnapshot
  readonly #listeners = new Set<() => void>()
  readonly #sdk: AiConnectionSdkPort
  readonly #platform: AiConnectionPlatformPort
  readonly #fetch: typeof globalThis.fetch
  #current: CurrentConnection | undefined
  #operation = 0
  #authorizationController: AbortController | undefined
  #finishPromise: Promise<AiFeatureIntent | undefined> | undefined
  #stopStorageListener: (() => void) | undefined
  #suppressedPersistentId: string | undefined
  #disposed = false
  readonly ready: Promise<void>

  constructor(options: AiConnectionStoreOptions = {}) {
    this.#sdk = { ...DEFAULT_SDK, ...options.sdk }
    this.#platform = { ...defaultPlatform(), ...options.platform }
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    const preferences = readAiConnectionPreferences(this.#platform.localStorage)
    this.#snapshot = Object.freeze({
      phase: peekPersistedConnectionId(this.#platform.localStorage) ? 'connecting' : 'disconnected',
      ...preferences,
    })
    this.ready = this.#restore()
  }

  getSnapshot = (): AiConnectionSnapshot => this.#snapshot

  subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => undefined
    this.#listeners.add(listener)
    if (this.#listeners.size === 1) {
      this.#attachStorageListener()
      void this.#resync().catch(() => undefined)
    }
    return () => {
      this.#listeners.delete(listener)
      if (this.#listeners.size === 0) this.#detachStorageListener()
    }
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#invalidateAuthorization()
    this.#current = undefined
    this.#detachStorageListener()
    this.#listeners.clear()
  }

  setProviderUrl(providerUrl: string): void {
    if (providerUrl === this.#snapshot.providerUrl) return
    const targetId = this.#current?.persistentId ?? peekPersistedConnectionId(this.#platform.localStorage)
    this.#invalidateAuthorization()
    this.#current = undefined
    this.#suppressedPersistentId = targetId
    const preferences = { providerUrl, experience: this.#snapshot.experience }
    writeAiConnectionPreferences(this.#platform.localStorage, preferences)
    this.#setSnapshot({ phase: 'disconnected', ...preferences })
    if (targetId) void this.#removePersistedIdentity(targetId)
  }

  setExperience(experience: OpenClawConnectionExperience): void {
    if (experience === this.#snapshot.experience) return
    const targetId = this.#current?.persistentId ?? peekPersistedConnectionId(this.#platform.localStorage)
    this.#invalidateAuthorization()
    this.#current = undefined
    this.#suppressedPersistentId = targetId
    const preferences = { providerUrl: this.#snapshot.providerUrl, experience }
    writeAiConnectionPreferences(this.#platform.localStorage, preferences)
    this.#setSnapshot({ phase: 'disconnected', ...preferences })
    if (targetId) void this.#removePersistedIdentity(targetId)
  }

  async authorize(options: AuthorizeAiConnectionOptions): Promise<void> {
    await this.ready
    const operation = this.#beginAuthorizationOperation()
    const controller = this.#authorizationController!
    const providerUrl = this.#snapshot.providerUrl
    const experience = this.#snapshot.experience
    let pendingTransaction: string | undefined
    let teardownStarted = false

    this.#setSnapshot({ phase: 'connecting', providerUrl, experience })
    try {
      const connectionEpoch = await this.#beginPersistedAuthorization(operation)
      this.#guardOperation(operation)
      const provider = await this.#sdk.discover({ providerUrl, experience, signal: controller.signal })
      this.#guardOperation(operation)
      const redirectUri = redirectUriFrom(this.#platform.currentUrl())
      const start = await this.#sdk.beginAuthorization({
        provider,
        redirectUri,
        tools: applicationTools(options.tools),
        callerContext: copyIntent(options.intent) as unknown as JsonObject,
        signal: controller.signal,
      })
      this.#guardOperation(operation)
      pendingTransaction = this.#sdk.serializeTransaction(start.transaction)
      this.#writePending({
        version: 1,
        transaction: pendingTransaction,
        expiresAt: start.expiresAt,
        connectionEpoch,
        intent: copyIntent(options.intent),
      })
      teardownStarted = true
      await options.beforeRedirect()
      this.#guardOperation(operation)
      this.#platform.navigate(start.authorizationUrl)
    } catch (error) {
      if (pendingTransaction) this.#removePendingIf(pendingTransaction)
      if (operation === this.#operation) this.#setError(error, 'Could not start OpenClaw authorization', { providerUrl, experience })
      if (teardownStarted) this.#platform.reload()
      throw error
    }
  }

  finishAuthorization(): Promise<AiFeatureIntent | undefined> {
    if (!this.#finishPromise) this.#finishPromise = this.#finishAuthorization()
    return this.#finishPromise
  }

  async disconnect(): Promise<void> {
    const current = this.#current
    const pending = readPendingAiAuthorization(this.#platform.sessionStorage)
    const targetId = current?.persistentId ?? peekPersistedConnectionId(this.#platform.localStorage)
    const expectedEpoch = current?.epoch ?? pending?.connectionEpoch
    this.#invalidateAuthorization()
    this.#current = undefined
    this.#suppressedPersistentId = targetId
    this.#setSnapshot({ phase: 'disconnected', providerUrl: this.#snapshot.providerUrl, experience: this.#snapshot.experience })
    const operation = this.#operation
    await this.ready
    let revoke: OpenClawConnection | undefined
    try {
      await this.#withCredentialLock(async (storage) => {
        const liveId = peekPersistedConnectionId(storage)
        const liveEpoch = readPersistedEpoch(storage)
        const matches = targetId ? liveId === targetId : Boolean(expectedEpoch && liveEpoch === expectedEpoch)
        if (!matches) return
        try {
          const record = await readPersistedAiConnection(storage, this.#appOrigin(), this.#platform.now())
          if (record?.status === 'ready' && (!targetId || record.id === targetId)) revoke = record.connection
        } catch { /* explicit disconnect still removes owned invalid bytes */ }
        writePersistedEpoch(storage, this.#platform.createGeneration())
        storage.removeItem(AI_CONNECTION_KEY)
        if (revoke) await this.#sdk.revoke({ connection: revoke })
      })
    } catch (error) {
      if (operation === this.#operation && !this.#current) this.#setError(error, 'OpenClaw disconnected locally, but revocation failed')
      throw error
    }
  }

  getExecution(tools: readonly ToolDefinition[]): { generation: string; model: LanguageModel } {
    const current = this.#approvedCurrent(tools)
    return { generation: current.generation, model: current.model }
  }

  getHistoryAccess(tools: readonly ToolDefinition[]): TutorHistoryAccess {
    const current = this.#approvedCurrent(tools)
    const scopeId = current.persistentId
    const generation = current.generation
    const client = createOpenClawConversationClient({
      connection: current.connection,
      getAccessToken: async (signal) => {
        this.#guardHistoryAccess(scopeId, generation, signal)
        const accessToken = await this.#getAccessToken(scopeId, signal)
        this.#guardHistoryAccess(scopeId, generation, signal)
        return accessToken
      },
      fetch: (input, init) => {
        this.#guardHistoryAccess(scopeId, generation, init?.signal ?? undefined)
        return this.#fetch(input, init)
      },
    })
    const access: TutorHistoryAccess = {
      scopeId,
      generation,
      list: async (signal) => {
        this.#guardHistoryAccess(scopeId, generation, signal)
        let descriptors
        try {
          descriptors = await client.list({ signal })
        } catch (error) {
          this.#guardHistoryAccess(scopeId, generation, signal)
          throw error
        }
        this.#guardHistoryAccess(scopeId, generation, signal)
        return descriptors
      },
      history: async (conversationId, signal) => {
        this.#guardHistoryAccess(scopeId, generation, signal)
        let history
        try {
          history = await client.history(conversationId, { signal })
        } catch (error) {
          this.#guardHistoryAccess(scopeId, generation, signal)
          throw error
        }
        this.#guardHistoryAccess(scopeId, generation, signal)
        return history
      },
    }
    return Object.freeze(access)
  }

  dismissPendingAuthorization(): void {
    this.#invalidateAuthorization()
    const pending = readPendingAiAuthorization(this.#platform.sessionStorage)
    this.#platform.sessionStorage?.removeItem(AI_PENDING_AUTHORIZATION_KEY)
    this.#cleanOwnedCallback(pending)
  }

  async #restore(): Promise<void> {
    try { await this.#resync() } catch (error) {
      if (!this.#disposed) this.#setError(error, 'Saved AI authorization could not be restored')
    }
  }

  async #resync(): Promise<void> {
    if (this.#disposed) return
    const operation = this.#operation
    try {
      await this.#withCredentialLock(async (storage) => {
        const record = await this.#readReadyUnderLock(storage)
        if (this.#disposed || operation !== this.#operation) return
        if (!record) {
          this.#suppressedPersistentId = undefined
          this.#current = undefined
          this.#setSnapshot({ phase: 'disconnected', ...readAiConnectionPreferences(storage) })
        } else if (record.id === this.#suppressedPersistentId) {
          return
        } else {
          this.#suppressedPersistentId = undefined
          this.#installRecord(record)
        }
      })
    } catch (error) {
      if (this.#disposed || operation !== this.#operation) return
      this.#current = undefined
      this.#setError(error, 'Saved AI authorization changed')
    }
  }

  async #finishAuthorization(): Promise<AiFeatureIntent | undefined> {
    const pending = readPendingAiAuthorization(this.#platform.sessionStorage)
    if (!pending) return undefined
    const intent = copyIntent(pending.intent)
    let transaction: OpenClawAuthorizationTransaction
    let callback: URL
    try {
      transaction = this.#sdk.parseTransaction(pending.transaction)
      callback = new URL(this.#platform.currentUrl())
    } catch (error) {
      this.#setError(error, 'Saved OpenClaw authorization data is invalid')
      return intent
    }
    if (!ownsAuthorizationCallback(callback, transaction)) return undefined
    if (!isStrictAuthorizationCallback(callback, transaction)) {
      this.#setError(new Error('OpenClaw authorization callback was invalid'), 'OpenClaw authorization callback was invalid', {
        providerUrl: transaction.issuer, experience: transaction.experience,
      })
      return intent
    }

    const operation = this.#beginAuthorizationOperation(false)
    const controller = this.#authorizationController!
    this.#setSnapshot({ phase: 'connecting', providerUrl: transaction.issuer, experience: transaction.experience })
    try {
      this.#assertPendingFresh(pending.expiresAt)
      const provider = await this.#sdk.discover({
        providerUrl: transaction.issuer, experience: transaction.experience, signal: controller.signal,
      })
      this.#guardOperation(operation)
      if (callback.searchParams.has('code')) {
        await this.#claimCallbackState(transaction.state, pending.expiresAt)
        this.#guardOperation(operation)
      }
      this.#assertPendingFresh(pending.expiresAt)
      const connection = await this.#sdk.completeAuthorization({
        provider, redirectUri: transaction.redirectUri, transaction, callbackUrl: callback.href, signal: controller.signal,
      })
      this.#guardOperation(operation)
      await this.#persistAuthorizedConnection(connection, transaction.experience, pending.connectionEpoch, operation)
      this.#guardOperation(operation)
      this.#removePendingIf(pending.transaction)
      this.#replaceCleanCallback(callback)
      return intent
    } catch (error) {
      if (operation !== this.#operation || error instanceof SupersededAuthorizationError) {
        this.#removePendingIf(pending.transaction)
        this.#replaceCleanCallback(callback)
        if (operation === this.#operation && !this.#current) {
          this.#setSnapshot({ phase: 'disconnected', ...readAiConnectionPreferences(this.#platform.localStorage) })
        }
        return undefined
      }
      this.#setError(error, 'OpenClaw authorization could not be completed', {
        providerUrl: transaction.issuer, experience: transaction.experience,
      })
      this.#removePendingIf(pending.transaction)
      this.#replaceCleanCallback(callback)
      return intent
    }
  }

  async #persistAuthorizedConnection(
    connection: OpenClawConnection,
    experience: OpenClawConnectionExperience,
    expectedEpoch: string,
    operation: number,
  ): Promise<void> {
    await this.#withCredentialLock(async (storage) => {
      this.#guardOperation(operation)
      if (readPersistedEpoch(storage) !== expectedEpoch) throw new SupersededAuthorizationError('This OpenClaw authorization was superseded')
      const id = this.#platform.createGeneration()
      const record = readyRecord({
        id, epoch: expectedEpoch, appOrigin: this.#appOrigin(), experience,
        grantExpiresAt: connection.refreshTokenExpiresAt, connection,
      })
      writePersistedAiConnection(storage, record)
      try {
        const validated = await readPersistedAiConnection(storage, this.#appOrigin(), this.#platform.now())
        this.#guardOperation(operation)
        if (!validated || validated.status !== 'ready' || validated.id !== id) throw new Error('Saved AI authorization was invalid')
        this.#installRecord(validated)
      } catch (error) {
        if (peekPersistedConnectionId(storage) === id) storage.removeItem(AI_CONNECTION_KEY)
        throw error
      }
    })
  }

  #installRecord(record: PersistedAiConnectionReady): void {
    if (record.id !== this.#suppressedPersistentId) this.#suppressedPersistentId = undefined
    const existing = this.#current
    if (existing?.persistentId === record.id) {
      if (!sameImmutableConnection(existing, record)) throw new Error('Saved AI authorization changed unexpectedly; connect again')
      existing.connection = record.connection
      this.#setSnapshot({ phase: 'connected', providerUrl: getOpenClawConnectionProviderUrl(record.connection), experience: record.experience, generation: existing.generation })
      return
    }
    const generation = this.#platform.createGeneration()
    const persistentId = record.id
    const model = this.#sdk.createModel({
      endpoint: record.connection.endpoint,
      model: record.connection.model,
      getAccessToken: (signal) => this.#getAccessToken(persistentId, signal),
    })
    this.#current = {
      generation, persistentId, epoch: record.epoch, experience: record.experience,
      grantExpiresAt: record.grantExpiresAt,
      connection: record.connection, model,
    }
    this.#setSnapshot({ phase: 'connected', providerUrl: getOpenClawConnectionProviderUrl(record.connection), experience: record.experience, generation })
  }

  #getAccessToken(persistentId: string, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted()
    if (this.#disposed || this.#current?.persistentId !== persistentId) {
      return Promise.reject(new Error('OpenClaw connection changed'))
    }
    const rotation = this.#withCredentialLock(async (storage) => {
      if (this.#disposed || this.#current?.persistentId !== persistentId) throw new Error('OpenClaw connection changed')
      const record = await this.#readReadyUnderLock(storage)
      if (!record || record.id !== persistentId) throw new Error('OpenClaw connection changed')
      if (!sameImmutableConnection(this.#current, record)) throw new Error('OpenClaw connection changed')
      if (Date.parse(record.connection.expiresAt) > this.#platform.now() + AI_REFRESH_BEFORE_MS) {
        if (!this.#adoptRotation(record)) throw new Error('OpenClaw connection changed')
        return record.connection.accessToken
      }
      try { writePersistedAiConnection(storage, rotatingRecord(record, this.#platform.now())) } catch {
        try { storage.removeItem(AI_CONNECTION_KEY) } catch { /* fail closed */ }
        throw new Error('AI authorization could not be rotated safely; connect again')
      }
      let saved: PersistedAiConnectionReady | undefined
      const getter = this.#sdk.createAccessTokenGetter({
        getConnection: () => record.connection,
        saveConnection: (next, expected) => {
          if (
            expected !== record.connection
            || readPersistedEpoch(storage) !== record.epoch
            || Date.parse(record.grantExpiresAt) <= this.#platform.now()
          ) return false
          const connection = clampConnectionGrant(next, record.grantExpiresAt)
          saved = readyRecord({
            id: record.id, epoch: record.epoch, appOrigin: record.appOrigin,
            experience: record.experience, grantExpiresAt: record.grantExpiresAt, connection,
          })
          writePersistedAiConnection(storage, saved)
          return true
        },
        refreshBeforeMs: AI_REFRESH_BEFORE_MS,
        now: this.#platform.now,
      })
      const accessToken = await getter()
      if (!saved) throw new Error('AI authorization rotation was not saved; connect again')
      if (!this.#adoptRotation(saved)) throw new Error('OpenClaw connection changed')
      return accessToken
    })
    const guarded = rotation.catch((error: unknown) => {
      if (this.#current?.persistentId === persistentId) {
        this.#current = undefined
        this.#setError(error, 'OpenClaw needs to be authorized again')
      }
      throw error
    })
    return signal ? waitForCaller(guarded, signal) : guarded
  }

  #approvedCurrent(tools: readonly ToolDefinition[]): CurrentConnection {
    const current = this.#current
    if (!current || this.#snapshot.phase !== 'connected') {
      throw new Error('Connect your AI before starting this request')
    }
    if (!sameApplicationTools(current.connection.applicationTools, tools)) {
      throw new Error('Bookhand tools changed after authorization; authorize them again')
    }
    return current
  }

  #guardHistoryAccess(persistentId: string, generation: string, signal?: AbortSignal): void {
    signal?.throwIfAborted()
    const current = this.#current
    if (this.#disposed || this.#snapshot.phase !== 'connected'
      || current?.persistentId !== persistentId || current.generation !== generation) {
      throw new Error('OpenClaw connection changed')
    }
  }

  #adoptRotation(record: PersistedAiConnectionReady): boolean {
    if (this.#current?.persistentId !== record.id) return false
    this.#current.connection = record.connection
    return true
  }

  async #beginPersistedAuthorization(operation: number): Promise<string> {
    return this.#withCredentialLock((storage) => {
      this.#guardOperation(operation)
      const epoch = this.#platform.createGeneration()
      writePersistedEpoch(storage, epoch)
      storage.removeItem(AI_CONNECTION_KEY)
      return epoch
    })
  }

  async #removePersistedIdentity(targetId: string): Promise<void> {
    try {
      await this.#withCredentialLock((storage) => {
        if (peekPersistedConnectionId(storage) !== targetId) return
        writePersistedEpoch(storage, this.#platform.createGeneration())
        storage.removeItem(AI_CONNECTION_KEY)
      })
    } catch (error) {
      if (!this.#disposed && !this.#current) this.#setError(error, 'Saved AI authorization could not be removed')
    }
  }

  async #readReadyUnderLock(storage: Storage): Promise<PersistedAiConnectionReady | undefined> {
    try {
      const record = await readPersistedAiConnection(storage, this.#appOrigin(), this.#platform.now())
      if (!record) return undefined
      if (
        Date.parse(record.grantExpiresAt) <= this.#platform.now()
        || (record.status === 'ready' && Date.parse(record.connection.refreshTokenExpiresAt) <= this.#platform.now())
      ) throw new Error('Saved AI authorization expired; connect again')
      if (record.epoch !== readPersistedEpoch(storage)) throw new Error('Saved AI authorization was superseded; connect again')
      if (record.status === 'rotating') throw new Error('AI authorization rotation was interrupted; connect again')
      return record
    } catch (error) {
      writePersistedEpoch(storage, this.#platform.createGeneration())
      storage.removeItem(AI_CONNECTION_KEY)
      throw error
    }
  }

  async #withCredentialLock<T>(callback: (storage: Storage) => T | Promise<T>): Promise<T> {
    const { locks, localStorage } = this.#platform
    if (!locks || !localStorage) throw new Error('This browser cannot safely save the OpenClaw connection')
    return locks.request(AI_CONNECTION_LOCK, { mode: 'exclusive' }, () => callback(localStorage))
  }

  async #claimCallbackState(state: string, expiresAt: string): Promise<void> {
    const { locks, localStorage } = this.#platform
    if (!locks || !localStorage) throw new Error('This browser cannot safely finish OpenClaw authorization; connect again in this tab')
    const markerKey = `${CONSUMED_MARKER_PREFIX}${state}`
    try {
      await locks.request(`bookhand-ai-oauth:${state}`, { mode: 'exclusive' }, () => {
        this.#assertPendingFresh(expiresAt)
        const liveMarkers = this.#pruneConsumedMarkers(localStorage)
        if (localStorage.getItem(markerKey) !== null) throw new Error('This OpenClaw authorization callback was already used in another tab')
        if (liveMarkers >= MAX_CONSUMED_MARKERS) throw new Error('Too many recent OpenClaw callbacks are recorded; wait for one to expire before connecting again')
        localStorage.setItem(markerKey, JSON.stringify({ expiresAt }))
      })
    } catch (error) {
      if (error instanceof Error) throw error
      throw new Error('This browser could not safely claim the OpenClaw authorization callback')
    }
  }

  #assertPendingFresh(expiresAt: string): void {
    const expiry = Date.parse(expiresAt)
    if (!Number.isFinite(expiry)) throw new Error('Saved OpenClaw authorization expiry was invalid; connect again')
    if (expiry <= this.#platform.now()) throw new Error('This OpenClaw authorization request expired; connect again')
  }

  #pruneConsumedMarkers(storage: Storage): number {
    const markerKeys: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(CONSUMED_MARKER_PREFIX)) markerKeys.push(key)
    }
    let liveMarkers = 0
    for (const key of markerKeys) {
      let expiresAt = Number.NaN
      try { expiresAt = Date.parse((JSON.parse(storage.getItem(key) ?? '') as { expiresAt?: string }).expiresAt ?? '') } catch { /* prune */ }
      if (!Number.isFinite(expiresAt) || expiresAt <= this.#platform.now()) storage.removeItem(key)
      else liveMarkers += 1
    }
    return liveMarkers
  }

  #beginAuthorizationOperation(clearPending = true): number {
    this.#suppressedPersistentId = this.#current?.persistentId
      ?? peekPersistedConnectionId(this.#platform.localStorage)
    this.#invalidateAuthorization()
    this.#current = undefined
    this.#finishPromise = undefined
    this.#authorizationController = new AbortController()
    if (clearPending) this.#platform.sessionStorage?.removeItem(AI_PENDING_AUTHORIZATION_KEY)
    return this.#operation
  }

  #invalidateAuthorization(): void {
    this.#operation += 1
    this.#authorizationController?.abort()
    this.#authorizationController = undefined
    this.#finishPromise = undefined
  }

  #guardOperation(operation: number): void {
    if (operation !== this.#operation || this.#disposed) throw new DOMException('Authorization was superseded', 'AbortError')
    this.#authorizationController?.signal.throwIfAborted()
  }

  #writePending(pending: PendingAiAuthorization): void {
    if (!this.#platform.sessionStorage) throw new Error('Session storage is required to connect your AI')
    this.#platform.sessionStorage.setItem(AI_PENDING_AUTHORIZATION_KEY, JSON.stringify(pending))
  }

  #removePendingIf(transaction: string): void {
    const storage = this.#platform.sessionStorage
    if (!storage) return
    const current = readPendingAiAuthorization(storage)
    if (current?.transaction === transaction) storage.removeItem(AI_PENDING_AUTHORIZATION_KEY)
  }

  #cleanOwnedCallback(pending: PendingAiAuthorization | undefined): void {
    if (!pending) return
    try {
      const transaction = this.#sdk.parseTransaction(pending.transaction)
      const callback = new URL(this.#platform.currentUrl())
      if (ownsAuthorizationCallback(callback, transaction)) this.#replaceCleanCallback(callback)
    } catch { /* an unowned URL is never rewritten */ }
  }

  #replaceCleanCallback(callback: URL): void { this.#platform.replaceUrl(stripOwnedAuthorizationParameters(callback).href) }

  #setError(error: unknown, fallback: string, identity: Pick<AiConnectionSnapshot, 'providerUrl' | 'experience'> = this.#snapshot): void {
    this.#setSnapshot({ ...identity, phase: 'error', error: errorMessage(error, fallback) })
  }

  #setSnapshot(snapshot: AiConnectionSnapshot): void {
    if (this.#disposed) return
    this.#snapshot = Object.freeze(snapshot)
    for (const listener of this.#listeners) listener()
  }

  #appOrigin(): string { return new URL(this.#platform.currentUrl()).origin }

  #attachStorageListener(): void {
    if (this.#stopStorageListener || !this.#platform.listenStorage) return
    this.#stopStorageListener = this.#platform.listenStorage(({ key }) => {
      if (key === AI_CONNECTION_PREFS_KEY) {
        if (!this.#current) this.#setSnapshot({ phase: 'disconnected', ...readAiConnectionPreferences(this.#platform.localStorage) })
      } else if (key === null || key === AI_CONNECTION_KEY || key === AI_CONNECTION_EPOCH_KEY) {
        void this.#resync().catch(() => undefined)
      }
    })
  }

  #detachStorageListener(): void {
    this.#stopStorageListener?.()
    this.#stopStorageListener = undefined
  }
}

function applicationTools(tools: readonly ToolDefinition[]): readonly ApplicationTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: JSON.parse(JSON.stringify(tool.inputSchema)) as ApplicationTool['inputSchema'],
    async execute(input, context) {
      const result = await tool.execute(input, context.signal ? { signal: context.signal } : undefined)
      return { content: result.content, structuredContent: result.structuredContent as JsonObject, ...(result.isError === undefined ? {} : { isError: result.isError }) }
    },
  }))
}

function sameApplicationTools(approved: OpenClawConnection['applicationTools'], tools: readonly ToolDefinition[]): boolean {
  const offered = tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
  return canonicalJson(approved) === canonicalJson(offered)
}

function sameImmutableConnection(current: CurrentConnection, record: PersistedAiConnectionReady): boolean {
  return current.epoch === record.epoch
    && current.experience === record.experience
    && current.grantExpiresAt === record.grantExpiresAt
    && current.connection.providerOrigin === record.connection.providerOrigin
    && current.connection.endpoint === record.connection.endpoint
    && current.connection.clientId === record.connection.clientId
    && current.connection.model === record.connection.model
    && current.connection.applicationToolsHash === record.connection.applicationToolsHash
    && canonicalJson(current.connection.applicationTools) === canonicalJson(record.connection.applicationTools)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function redirectUriFrom(currentUrl: string): string {
  const redirect = new URL(currentUrl)
  redirect.hash = ''
  for (const key of OWNED_CALLBACK_KEYS) redirect.searchParams.delete(key)
  return redirect.href
}

function copyIntent(intent: AiFeatureIntent): AiFeatureIntent { return JSON.parse(JSON.stringify(intent)) as AiFeatureIntent }
function errorMessage(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback }

function waitForCaller<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

function defaultPlatform(): AiConnectionPlatformPort {
  return {
    get sessionStorage() { try { return globalThis.sessionStorage } catch { return undefined } },
    get localStorage() { try { return globalThis.localStorage } catch { return undefined } },
    get locks() {
      const locks = globalThis.navigator?.locks
      return locks ? { request: locks.request.bind(locks) as AiConnectionLockPort['request'] } : undefined
    },
    currentUrl: () => globalThis.location.href,
    replaceUrl: (url) => globalThis.history.replaceState(globalThis.history.state, '', url),
    navigate: (url) => globalThis.location.assign(url),
    reload: () => globalThis.location.reload(),
    now: () => Date.now(),
    createGeneration: () => globalThis.crypto.randomUUID(),
    listenStorage: (listener) => {
      const handler = (event: StorageEvent) => listener({ key: event.key })
      globalThis.addEventListener('storage', handler)
      return () => globalThis.removeEventListener('storage', handler)
    },
  }
}
