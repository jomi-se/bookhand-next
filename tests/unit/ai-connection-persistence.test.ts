// @vitest-environment jsdom

import { webcrypto } from 'node:crypto'
import {
  createOpenClawAccessTokenGetter,
  revokeOpenClawConnection,
  type OpenClawConnection,
} from '@open-agent-connect/web'
import type { LanguageModel } from 'ai'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  AiConnectionStore,
  type AiConnectionLockPort,
  type AiConnectionPlatformPort,
} from '../../src/ai/connection.ts'
import {
  AI_CONNECTION_EPOCH_KEY,
  AI_CONNECTION_KEY,
  AI_CONNECTION_LOCK,
  AI_CONNECTION_PREFS_KEY,
  readAiConnectionPreferences,
  readPersistedAiConnection,
  readyRecord,
  rotatingRecord,
  writeAiConnectionPreferences,
  writePersistedAiConnection,
  writePersistedEpoch,
  type PersistedAiConnectionReady,
} from '../../src/ai/connection-persistence.ts'
import type { ToolDefinition } from '../../src/webmcp/model-context.ts'

beforeAll(() => {
  if (!globalThis.crypto.subtle) {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto })
  }
})

const APP_ORIGIN = 'https://bookhand.test'
const PROVIDER_ORIGIN = 'https://openclaw.test'

function tool(): ToolDefinition {
  return {
    name: 'get_reading_context',
    description: 'Read the current page',
    inputSchema: {
      type: 'object',
      properties: { detail: { type: 'boolean' } },
      additionalProperties: false,
    },
    outputSchema: { type: 'object' },
    execute: vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'page' }],
      structuredContent: { ok: true },
    })),
  }
}

const declarations = [{
  name: 'get_reading_context',
  description: 'Read the current page',
  inputSchema: {
    type: 'object',
    properties: { detail: { type: 'boolean' } },
    additionalProperties: false,
  },
}] as const

class SharedStorage {
  readonly #values = new Map<string, string>()
  readonly #listeners = new Map<symbol, Set<(event: { key: string | null }) => void>>()
  readonly #setFailures: Array<{
    predicate: (key: string, value: string) => boolean
    replacements: Readonly<Record<string, string>>
  }> = []
  readonly storage: Storage

  get listenerCount(): number {
    return [...this.#listeners.values()].reduce((count, listeners) => count + listeners.size, 0)
  }

  constructor() {
    this.storage = this.#storageFor(Symbol('external fixture'))
  }

  tab(): { storage: Storage; listen: (listener: (event: { key: string | null }) => void) => () => void } {
    const owner = Symbol('browser tab')
    return {
      storage: this.#storageFor(owner),
      listen: (listener) => {
        const listeners = this.#listeners.get(owner) ?? new Set()
        listeners.add(listener)
        this.#listeners.set(owner, listeners)
        return () => {
          listeners.delete(listener)
          if (listeners.size === 0) this.#listeners.delete(owner)
        }
      },
    }
  }

  failNextSet(
    predicate: (key: string, value: string) => boolean,
    replacements: Readonly<Record<string, string>> = {},
  ): void {
    this.#setFailures.push({ predicate, replacements })
  }

  #storageFor(owner: symbol): Storage {
    const size = () => this.#values.size
    return {
      get length() { return size() },
      clear: () => {
        this.#values.clear()
        this.#emit(owner, null)
      },
      getItem: (key) => this.#values.get(key) ?? null,
      key: (index) => [...this.#values.keys()][index] ?? null,
      removeItem: (key) => {
        if (!this.#values.delete(key)) return
        this.#emit(owner, key)
      },
      setItem: (key, value) => {
        const failureIndex = this.#setFailures.findIndex((failure) => failure.predicate(key, value))
        if (failureIndex >= 0) {
          const [failure] = this.#setFailures.splice(failureIndex, 1)
          for (const [replacementKey, replacementValue] of Object.entries(failure.replacements)) {
            this.#values.set(replacementKey, replacementValue)
            this.#emit(owner, replacementKey)
          }
          throw new Error('Fixture storage write failed')
        }
        this.#values.set(key, value)
        this.#emit(owner, key)
      },
    }
  }

  #emit(owner: symbol, key: string | null): void {
    for (const [listenerOwner, listeners] of this.#listeners) {
      if (listenerOwner === owner) continue
      for (const listener of listeners) listener({ key })
    }
  }
}

// A Web Locks-shaped FIFO shared by every simulated tab.
class SerialLocks implements AiConnectionLockPort {
  #tail = Promise.resolve()

  request<T>(_name: string, _options: { readonly mode: 'exclusive' }, callback: () => T | Promise<T>): Promise<T> {
    const result = this.#tail.then(callback)
    this.#tail = result.then(() => undefined, () => undefined)
    return result
  }
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

function platform(options: {
  shared: SharedStorage
  locks: SerialLocks
  now: () => number
  generation: () => string
}): AiConnectionPlatformPort {
  const tab = options.shared.tab()
  return {
    sessionStorage: memoryStorage(),
    localStorage: tab.storage,
    locks: options.locks,
    currentUrl: () => `${APP_ORIGIN}/read?book=book-1`,
    replaceUrl: () => undefined,
    navigate: () => undefined,
    reload: () => undefined,
    now: options.now,
    createGeneration: options.generation,
    listenStorage: tab.listen,
  }
}

function modelCapture() {
  const getters: Array<(signal?: AbortSignal) => string | Promise<string>> = []
  const createModel = vi.fn((options: { getAccessToken: (signal?: AbortSignal) => string | Promise<string> }) => {
    getters.push(options.getAccessToken)
    return {} as LanguageModel
  })
  return { createModel, getters }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve
  })
  return { promise, resolve }
}

function oauthFixture(refreshResponse?: Promise<Response>) {
  const calls: Array<{ url: string; body?: URLSearchParams }> = []
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body instanceof URLSearchParams ? init.body : undefined
    calls.push({ url, ...(body ? { body } : {}) })
    if (url.endsWith('/agent-connect/oauth/token') && body?.get('grant_type') === 'refresh_token') {
      return refreshResponse ?? json({
        access_token: 'rotated-access',
        refresh_token: 'rotated-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token_expires_in: 7200,
        scope: 'responses',
      })
    }
    if (url.endsWith('/agent-connect/oauth/revoke')) return new Response(null)
    throw new Error(`Unexpected fixture request: ${url}`)
  })
  return {
    fetch,
    calls,
    refreshCalls: () => calls.filter(({ body }) => body?.get('grant_type') === 'refresh_token'),
    revokeCalls: () => calls.filter(({ url }) => url.endsWith('/agent-connect/oauth/revoke')),
  }
}

function sdk(fixture: ReturnType<typeof oauthFixture>, models: ReturnType<typeof modelCapture>) {
  return {
    createModel: models.createModel,
    createAccessTokenGetter: (options: Parameters<typeof createOpenClawAccessTokenGetter>[0]) =>
      createOpenClawAccessTokenGetter({ ...options, fetch: fixture.fetch }),
    revoke: (options: Parameters<typeof revokeOpenClawConnection>[0]) =>
      revokeOpenClawConnection({ ...options, fetch: fixture.fetch }),
  }
}

async function hash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)))
  let binary = ''
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function persistedStatus(value: string): unknown {
  try { return (JSON.parse(value) as { status?: unknown }).status } catch { return undefined }
}

async function connection(options: {
  now: number
  accessExpiresAt?: number
  refreshExpiresAt?: number
  accessToken?: string
  refreshToken?: string
  tools?: typeof declarations
}): Promise<OpenClawConnection> {
  const applicationTools = options.tools ?? declarations
  return {
    version: 1,
    providerOrigin: PROVIDER_ORIGIN,
    endpoint: `${PROVIDER_ORIGIN}/v1/responses`,
    clientId: APP_ORIGIN,
    accessToken: options.accessToken ?? 'access-old',
    refreshToken: options.refreshToken ?? 'refresh-old',
    expiresAt: new Date(options.accessExpiresAt ?? options.now + 3_600_000).toISOString(),
    refreshTokenExpiresAt: new Date(options.refreshExpiresAt ?? options.now + 7_200_000).toISOString(),
    model: 'openclaw/default',
    applicationTools,
    applicationToolsHash: await hash(applicationTools),
  }
}

async function seedReady(options: {
  shared: SharedStorage
  now: number
  id?: string
  epoch?: string
  grantExpiresAt?: number
  connection?: OpenClawConnection
}): Promise<PersistedAiConnectionReady> {
  const epoch = options.epoch ?? 'epoch-1'
  const current = options.connection ?? await connection({ now: options.now })
  const record = readyRecord({
    id: options.id ?? 'connection-1',
    epoch,
    appOrigin: APP_ORIGIN,
    experience: 'tailscale',
    grantExpiresAt: new Date(options.grantExpiresAt ?? options.now + 7_200_000).toISOString(),
    connection: current,
  })
  writePersistedEpoch(options.shared.storage, epoch)
  writePersistedAiConnection(options.shared.storage, record)
  return record
}

function storeOptions(options: {
  shared: SharedStorage
  locks: SerialLocks
  now: () => number
  generation: () => string
  fixture: ReturnType<typeof oauthFixture>
  models: ReturnType<typeof modelCapture>
}) {
  return {
    platform: platform(options),
    sdk: sdk(options.fixture, options.models),
  }
}

describe('AiConnectionStore persistence', () => {
  it.each(['', '/agent-connect'])('restores a persisted SDK connection with the %s provider layout', async (path) => {
    const now = Date.now()
    const shared = new SharedStorage()
    const base = await connection({ now })
    const persisted = await seedReady({
      shared, now, connection: { ...base, endpoint: `${PROVIDER_ORIGIN}${path}/v1/responses` },
    })
    const restored = await readPersistedAiConnection(shared.storage, APP_ORIGIN, now)
    expect(restored?.status).toBe('ready')
    if (restored?.status !== 'ready') throw new Error('Expected ready fixture')
    expect(restored.connection).toEqual(persisted.connection)
    expect(Object.isFrozen(restored.connection)).toBe(true)
    expect(restored.grantExpiresAt).toBe(persisted.grantExpiresAt)
    const models = modelCapture()
    const fixture = oauthFixture()
    const store = new AiConnectionStore(storeOptions({
      shared, locks: new SerialLocks(), now: () => now,
      generation: () => 'restored-layout', fixture, models,
    }))
    await store.ready
    try {
      expect(store.getSnapshot()).toMatchObject({ phase: 'connected', providerUrl: `${PROVIDER_ORIGIN}${path}` })
      await expect(models.getters[0]()).resolves.toBe('access-old')
      expect(fixture.refreshCalls()).toHaveLength(0)
    } finally { store.dispose() }
  })

  it.each(['', '/agent-connect'])('preserves provider preferences for the supported %s layout', (path) => {
    const shared = new SharedStorage()
    const providerUrl = `${PROVIDER_ORIGIN}${path}`
    writeAiConnectionPreferences(shared.storage, { providerUrl, experience: 'tailscale' })
    expect(readAiConnectionPreferences(shared.storage)).toEqual({ providerUrl, experience: 'tailscale' })
  })

  it('retains the SDK validation cause without changing the saved-record envelope', async () => {
    const now = Date.now()
    const shared = new SharedStorage()
    const persisted = await seedReady({ shared, now })
    // Simulate corrupted stored bytes directly, rather than asking the SDK
    // serializer to manufacture an invalid record.
    shared.storage.setItem(AI_CONNECTION_KEY, JSON.stringify({
      ...persisted, connection: { ...persisted.connection, applicationToolsHash: 'invalid' },
    }))
    const error = await readPersistedAiConnection(shared.storage, APP_ORIGIN, now).catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ message: 'Saved AI authorization was invalid; connect again', cause: expect.any(Error) })
    expect(shared.storage.getItem(AI_CONNECTION_KEY)).toContain('connection-1')
  })

  it('rejects refresh authority beyond the original app grant even when the SDK record is valid', async () => {
    const now = Date.now()
    const shared = new SharedStorage()
    await seedReady({ shared, now, grantExpiresAt: now + 60_000 })
    await expect(readPersistedAiConnection(shared.storage, APP_ORIGIN, now)).rejects.toThrow(/expired/)
  })

  it('restores a validated grant and preferences across stores, retaining preferences after disconnect', async () => {
    const now = Date.now()
    const shared = new SharedStorage()
    const locks = new SerialLocks()
    let nextGeneration = 0
    const generation = () => `generation-${++nextGeneration}`
    writeAiConnectionPreferences(shared.storage, { providerUrl: PROVIDER_ORIGIN, experience: 'tailscale' })
    const persisted = await seedReady({ shared, now })
    const fixture = oauthFixture()
    const firstModels = modelCapture()
    const first = new AiConnectionStore(storeOptions({ shared, locks, now: () => now, generation, fixture, models: firstModels }))
    await first.ready

    expect(first.getSnapshot()).toMatchObject({
      phase: 'connected', providerUrl: PROVIDER_ORIGIN, experience: 'tailscale', generation: expect.any(String),
    })
    expect(first.getExecution([tool()]).model).toBeTruthy()

    const secondModels = modelCapture()
    const second = new AiConnectionStore(storeOptions({ shared, locks, now: () => now, generation, fixture, models: secondModels }))
    await second.ready
    expect(second.getSnapshot()).toMatchObject({ phase: 'connected', providerUrl: PROVIDER_ORIGIN })
    const secondGeneration = second.getSnapshot().generation
    const changed = vi.fn()
    const unsubscribe = second.subscribe(changed)
    changed.mockClear()
    writePersistedAiConnection(shared.storage, readyRecord({
      ...persisted,
      connection: {
        ...persisted.connection,
        accessToken: 'storage-event-access',
        refreshToken: 'storage-event-refresh',
        expiresAt: new Date(now + 3_600_000).toISOString(),
      },
    }))
    await vi.waitFor(() => expect(changed).toHaveBeenCalled())
    expect(second.getSnapshot().generation).toBe(secondGeneration)
    await expect(secondModels.getters[0]()).resolves.toBe('storage-event-access')
    unsubscribe()
    expect(shared.listenerCount).toBe(0)

    const replaced = vi.fn()
    second.subscribe(replaced)
    const replacement = await connection({
      now,
      accessToken: 'replacement-access',
      refreshToken: 'replacement-refresh',
    })
    await locks.request(AI_CONNECTION_LOCK, { mode: 'exclusive' }, () => seedReady({
      shared,
      now,
      id: 'connection-replacement',
      epoch: 'epoch-replacement',
      connection: replacement,
    }))
    await vi.waitFor(() => expect(second.getSnapshot().generation).not.toBe(secondGeneration))
    expect(replaced).toHaveBeenCalled()
    await expect(secondModels.getters[0]()).rejects.toThrow(/connection changed/)

    await first.disconnect()
    expect(shared.storage.getItem(AI_CONNECTION_KEY)).toContain('connection-replacement')
    const removed = vi.fn()
    second.subscribe(removed)
    shared.storage.removeItem(AI_CONNECTION_KEY)
    await vi.waitFor(() => expect(second.getSnapshot().phase).toBe('disconnected'))
    expect(removed).toHaveBeenCalled()
    first.dispose()
    second.dispose()

    const reloaded = new AiConnectionStore(storeOptions({
      shared, locks, now: () => now, generation, fixture, models: modelCapture(),
    }))
    await reloaded.ready
    expect(reloaded.getSnapshot()).toEqual({
      phase: 'disconnected', providerUrl: PROVIDER_ORIGIN, experience: 'tailscale',
    })
    expect(shared.storage.getItem(AI_CONNECTION_KEY)).toBeNull()
    expect(shared.storage.getItem(AI_CONNECTION_PREFS_KEY)).not.toBeNull()
    reloaded.dispose()
  })

  it('serializes two expired-token callers so one refresh saves and both use the latest token', async () => {
    const now = Date.now()
    const shared = new SharedStorage()
    const locks = new SerialLocks()
    let nextGeneration = 0
    const generation = () => `generation-${++nextGeneration}`
    await seedReady({
      shared,
      now,
      connection: await connection({ now, accessExpiresAt: now - 1 }),
    })
    const pending = deferred<Response>()
    const fixture = oauthFixture(pending.promise)
    const firstModels = modelCapture()
    const secondModels = modelCapture()
    const first = new AiConnectionStore(storeOptions({ shared, locks, now: () => now, generation, fixture, models: firstModels }))
    const second = new AiConnectionStore(storeOptions({ shared, locks, now: () => now, generation, fixture, models: secondModels }))
    await Promise.all([first.ready, second.ready])

    const firstToken = firstModels.getters[0]()
    const secondToken = secondModels.getters[0]()
    await vi.waitFor(() => expect(fixture.refreshCalls()).toHaveLength(1))
    expect(fixture.refreshCalls()[0].body?.get('refresh_token')).toBe('refresh-old')
    pending.resolve(json({
      access_token: 'rotated-access', refresh_token: 'rotated-refresh', token_type: 'Bearer',
      expires_in: 3600, refresh_token_expires_in: 7200, scope: 'responses',
    }))

    await expect(Promise.all([firstToken, secondToken])).resolves.toEqual(['rotated-access', 'rotated-access'])
    expect(fixture.refreshCalls()).toHaveLength(1)
    expect(shared.storage.getItem(AI_CONNECTION_KEY)).toContain('rotated-refresh')
    first.dispose()
    second.dispose()
  })

  it('keeps the credential lock through refresh and save after only the waiting caller aborts', async () => {
    const now = Date.now()
    const shared = new SharedStorage()
    const locks = new SerialLocks()
    let nextGeneration = 0
    const generation = () => `generation-${++nextGeneration}`
    await seedReady({ shared, now, connection: await connection({ now, accessExpiresAt: now - 1 }) })
    const pending = deferred<Response>()
    const fixture = oauthFixture(pending.promise)
    const firstModels = modelCapture()
    const secondModels = modelCapture()
    const first = new AiConnectionStore(storeOptions({ shared, locks, now: () => now, generation, fixture, models: firstModels }))
    const second = new AiConnectionStore(storeOptions({ shared, locks, now: () => now, generation, fixture, models: secondModels }))
    await Promise.all([first.ready, second.ready])

    const caller = new AbortController()
    const abandoned = firstModels.getters[0](caller.signal)
    await vi.waitFor(() => expect(fixture.refreshCalls()).toHaveLength(1))
    caller.abort(new DOMException('Caller stopped', 'AbortError'))
    await expect(abandoned).rejects.toMatchObject({ name: 'AbortError' })
    let waitingSettled = false
    const waiting = Promise.resolve(secondModels.getters[0]()).finally(() => { waitingSettled = true })
    await Promise.resolve()
    expect(waitingSettled).toBe(false)
    expect(fixture.refreshCalls()).toHaveLength(1)

    pending.resolve(json({
      access_token: 'after-abort', refresh_token: 'refresh-after-abort', token_type: 'Bearer',
      expires_in: 3600, refresh_token_expires_in: 7200, scope: 'responses',
    }))
    await expect(waiting).resolves.toBe('after-abort')
    expect(fixture.refreshCalls()).toHaveLength(1)
    expect(shared.storage.getItem(AI_CONNECTION_KEY)).toContain('refresh-after-abort')
    first.dispose()
    second.dispose()
  })

  it('fails closed on an orphan rotation marker without constructing a model or replaying refresh', async () => {
    const now = Date.now()
    const shared = new SharedStorage()
    const locks = new SerialLocks()
    const ready = await seedReady({ shared, now, connection: await connection({ now, accessExpiresAt: now - 1 }) })
    writePersistedAiConnection(shared.storage, rotatingRecord(ready, now))
    const fixture = oauthFixture()
    const models = modelCapture()
    const store = new AiConnectionStore(storeOptions({
      shared, locks, now: () => now, generation: () => 'generation-1', fixture, models,
    }))

    await store.ready
    expect(store.getSnapshot()).toMatchObject({ phase: 'error', error: expect.stringMatching(/rotation was interrupted/) })
    expect(models.createModel).not.toHaveBeenCalled()
    expect(fixture.refreshCalls()).toHaveLength(0)
    expect(shared.storage.getItem(AI_CONNECTION_KEY)).toBeNull()
    expect(() => store.getExecution([tool()])).toThrow(/Connect your AI/)
    store.dispose()
  })

  it('fails closed without retry on refresh rejection and pre/post-refresh persistence failures', async () => {
    const now = Date.now()

    async function setup(shared: SharedStorage, fixture: ReturnType<typeof oauthFixture>) {
      const locks = new SerialLocks()
      let nextGeneration = 0
      const generation = () => `generation-${++nextGeneration}`
      await seedReady({ shared, now, connection: await connection({ now, accessExpiresAt: now - 1 }) })
      const models = modelCapture()
      const store = new AiConnectionStore(storeOptions({ shared, locks, now: () => now, generation, fixture, models }))
      await store.ready
      return { locks, generation, models, store }
    }

    const rejectedStorage = new SharedStorage()
    const rejectedFixture = oauthFixture(Promise.resolve(json({ error: 'invalid_grant' }, 400)))
    const rejected = await setup(rejectedStorage, rejectedFixture)
    await expect(rejected.models.getters[0]()).rejects.toThrow(/authorize it again/)
    expect(rejected.store.getSnapshot()).toMatchObject({ phase: 'error' })
    expect(JSON.parse(rejectedStorage.storage.getItem(AI_CONNECTION_KEY)!).status).toBe('rotating')
    await expect(rejected.models.getters[0]()).rejects.toThrow(/connection changed/)
    expect(rejectedFixture.refreshCalls()).toHaveLength(1)
    rejected.store.dispose()

    const markerStorage = new SharedStorage()
    const markerFixture = oauthFixture()
    const marker = await setup(markerStorage, markerFixture)
    markerStorage.failNextSet((key, value) => key === AI_CONNECTION_KEY && persistedStatus(value) === 'rotating')
    await expect(marker.models.getters[0]()).rejects.toThrow(/could not be rotated safely/)
    expect(marker.store.getSnapshot()).toMatchObject({ phase: 'error' })
    expect(markerStorage.storage.getItem(AI_CONNECTION_KEY)).toBeNull()
    expect(markerFixture.refreshCalls()).toHaveLength(0)
    await expect(marker.models.getters[0]()).rejects.toThrow(/connection changed/)
    marker.store.dispose()

    const saveStorage = new SharedStorage()
    const saveFixture = oauthFixture()
    const save = await setup(saveStorage, saveFixture)
    const replacementConnection = await connection({
      now,
      accessToken: 'replacement-access',
      refreshToken: 'replacement-refresh',
    })
    const replacement = readyRecord({
      id: 'connection-replacement',
      epoch: 'epoch-replacement',
      appOrigin: APP_ORIGIN,
      experience: 'tailscale',
      grantExpiresAt: replacementConnection.refreshTokenExpiresAt,
      connection: replacementConnection,
    })
    saveStorage.failNextSet(
      (key, value) => key === AI_CONNECTION_KEY && persistedStatus(value) === 'ready'
        && value.includes('rotated-refresh'),
      {
        [AI_CONNECTION_EPOCH_KEY]: replacement.epoch,
        [AI_CONNECTION_KEY]: JSON.stringify(replacement),
      },
    )
    await expect(save.models.getters[0]()).rejects.toThrow()
    expect(save.store.getSnapshot()).toMatchObject({ phase: 'error' })
    expect(saveFixture.refreshCalls()).toHaveLength(1)
    expect(saveStorage.storage.getItem(AI_CONNECTION_KEY)).toContain('connection-replacement')
    await expect(save.models.getters[0]()).rejects.toThrow(/connection changed/)
    expect(saveFixture.refreshCalls()).toHaveLength(1)

    const replacementModels = modelCapture()
    const replacementStore = new AiConnectionStore(storeOptions({
      shared: saveStorage,
      locks: save.locks,
      now: () => now,
      generation: save.generation,
      fixture: saveFixture,
      models: replacementModels,
    }))
    await replacementStore.ready
    expect(replacementStore.getSnapshot()).toMatchObject({ phase: 'connected' })
    await expect(replacementModels.getters[0]()).resolves.toBe('replacement-access')
    save.store.dispose()
    replacementStore.dispose()
  })

  it('queues disconnect behind refresh, using rotated credentials but preserving a replacement that wins first', async () => {
    const now = Date.now()

    async function setup() {
      const shared = new SharedStorage()
      const locks = new SerialLocks()
      let nextGeneration = 0
      const generation = () => `generation-${++nextGeneration}`
      await seedReady({ shared, now, connection: await connection({ now, accessExpiresAt: now - 1 }) })
      const pending = deferred<Response>()
      const fixture = oauthFixture(pending.promise)
      const models = modelCapture()
      const store = new AiConnectionStore(storeOptions({ shared, locks, now: () => now, generation, fixture, models }))
      await store.ready
      return { shared, locks, generation, pending, fixture, models, store }
    }

    const latest = await setup()
    const refreshing = latest.models.getters[0]()
    await vi.waitFor(() => expect(latest.fixture.refreshCalls()).toHaveLength(1))
    const disconnecting = latest.store.disconnect()
    expect(latest.store.getSnapshot().phase).toBe('disconnected')
    latest.pending.resolve(json({
      access_token: 'rotated-access', refresh_token: 'rotated-refresh', token_type: 'Bearer',
      expires_in: 3600, refresh_token_expires_in: 7200, scope: 'responses',
    }))
    await expect(refreshing).rejects.toThrow(/connection changed/)
    await disconnecting
    expect(latest.fixture.revokeCalls()).toHaveLength(1)
    expect(latest.fixture.revokeCalls()[0].body?.get('token')).toBe('rotated-refresh')
    expect(latest.shared.storage.getItem(AI_CONNECTION_KEY)).toBeNull()
    latest.store.dispose()

    const replaced = await setup()
    const rotating = replaced.models.getters[0]()
    await vi.waitFor(() => expect(replaced.fixture.refreshCalls()).toHaveLength(1))
    const replacementConnection = await connection({
      now, accessToken: 'replacement-access', refreshToken: 'replacement-refresh',
    })
    const replacing = replaced.locks.request(AI_CONNECTION_LOCK, { mode: 'exclusive' }, () => {
      writePersistedEpoch(replaced.shared.storage, 'epoch-replacement')
      return seedReady({
        shared: replaced.shared,
        now,
        id: 'connection-replacement',
        epoch: 'epoch-replacement',
        connection: replacementConnection,
      })
    })
    const disconnectAfterReplacement = replaced.store.disconnect()
    replaced.pending.resolve(json({
      access_token: 'rotated-access', refresh_token: 'rotated-refresh', token_type: 'Bearer',
      expires_in: 3600, refresh_token_expires_in: 7200, scope: 'responses',
    }))
    await expect(rotating).rejects.toThrow(/connection changed/)
    await replacing
    await disconnectAfterReplacement
    expect(replaced.shared.storage.getItem(AI_CONNECTION_KEY)).toContain('connection-replacement')
    expect(replaced.shared.storage.getItem(AI_CONNECTION_KEY)).toContain('replacement-refresh')
    expect(replaced.fixture.revokeCalls()).toHaveLength(0)
    replaced.store.dispose()
  })

  it('rejects invalid persisted identity, endpoint, hash, or schema before constructing a model', async () => {
    const now = Date.now()
    const invalidConnections: OpenClawConnection[] = []
    const base = await connection({ now })
    invalidConnections.push({ ...base, clientId: 'https://other-app.test' })
    invalidConnections.push({ ...base, endpoint: `${PROVIDER_ORIGIN}/v1/other` })
    invalidConnections.push({ ...base, applicationToolsHash: 'A'.repeat(43) })
    const badSchemaTools = [{ ...declarations[0], inputSchema: { type: 'not-a-json-schema-type' } }]
    invalidConnections.push({
      ...base,
      applicationTools: badSchemaTools,
      applicationToolsHash: await hash(badSchemaTools),
    })

    for (const invalid of invalidConnections) {
      const shared = new SharedStorage()
      const locks = new SerialLocks()
      const persisted = await seedReady({ shared, now })
      shared.storage.setItem(AI_CONNECTION_KEY, JSON.stringify({ ...persisted, connection: invalid }))
      const models = modelCapture()
      const store = new AiConnectionStore(storeOptions({
        shared, locks, now: () => now, generation: () => 'generation-1', fixture: oauthFixture(), models,
      }))
      await store.ready
      expect(store.getSnapshot()).toMatchObject({ phase: 'error' })
      expect(models.createModel).not.toHaveBeenCalled()
      expect(shared.storage.getItem(AI_CONNECTION_KEY)).toBeNull()
      store.dispose()
    }
  })

  it('refreshes an expired access token but rejects an expired absolute grant even with fresh access', async () => {
    const now = Date.now()
    const locks = new SerialLocks()
    let nextGeneration = 0
    const generation = () => `generation-${++nextGeneration}`

    const refreshable = new SharedStorage()
    await seedReady({
      shared: refreshable,
      now,
      grantExpiresAt: now + 120_000,
      connection: await connection({ now, accessExpiresAt: now - 1, refreshExpiresAt: now + 120_000 }),
    })
    const refreshFixture = oauthFixture()
    const refreshModels = modelCapture()
    const refreshStore = new AiConnectionStore(storeOptions({
      shared: refreshable, locks, now: () => now, generation, fixture: refreshFixture, models: refreshModels,
    }))
    await refreshStore.ready
    await expect(refreshModels.getters[0]()).resolves.toBe('rotated-access')
    expect(refreshFixture.refreshCalls()).toHaveLength(1)
    const clamped = JSON.parse(refreshable.storage.getItem(AI_CONNECTION_KEY)!) as PersistedAiConnectionReady
    expect(clamped.connection.refreshTokenExpiresAt).toBe(new Date(now + 120_000).toISOString())
    expect(clamped.grantExpiresAt).toBe(new Date(now + 120_000).toISOString())
    refreshStore.dispose()

    const expired = new SharedStorage()
    await seedReady({
      shared: expired,
      now,
      grantExpiresAt: now - 1,
      connection: await connection({ now, accessExpiresAt: now + 3_600_000, refreshExpiresAt: now + 7_200_000 }),
    })
    const expiredFixture = oauthFixture()
    const expiredModels = modelCapture()
    const expiredStore = new AiConnectionStore(storeOptions({
      shared: expired, locks, now: () => now, generation, fixture: expiredFixture, models: expiredModels,
    }))
    await expiredStore.ready
    expect(expiredStore.getSnapshot()).toMatchObject({ phase: 'error', error: expect.stringMatching(/expired/) })
    expect(expiredModels.createModel).not.toHaveBeenCalled()
    expect(expiredFixture.refreshCalls()).toHaveLength(0)
    expiredStore.dispose()
  })
})
