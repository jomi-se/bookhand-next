// @vitest-environment jsdom

import { webcrypto } from 'node:crypto'
import { createOpenClawAccessTokenGetter, OpenClawConnectionError } from '@open-agent-connect/web'
import type { LanguageModel } from 'ai'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AiConnectionStore,
  type AiConnectionLockPort,
  type AiConnectionPlatformPort,
} from '../../src/ai/connection.ts'
import { ConversationHistoryUnavailableError } from '../../src/ai/conversation-history.ts'
import { AI_CONNECTION_KEY } from '../../src/ai/connection-persistence.ts'
import {
  AI_PENDING_AUTHORIZATION_KEY,
  inspectPendingAiReturn,
  readPendingAiIntent,
  type AiFeatureIntent,
} from '../../src/ai/pending-intent.ts'
import type { ToolDefinition } from '../../src/webmcp/model-context.ts'

beforeAll(() => {
  if (!globalThis.crypto.subtle) {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto })
  }
})

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

afterEach(() => vi.restoreAllMocks())

const intent: AiFeatureIntent = {
  feature: 'tutor',
  bookId: 'book-1',
  draft: 'Explain this passage',
  attachment: {
    bookId: 'book-1',
    selection: {
      quote: 'A copied passage',
      range: {
        startCfi: '/6/2!/4/2:0',
        endCfi: '/6/2!/4/2:16',
        cfi: '/6/2!/4/2:0,/1:0,/1:16',
        sectionIndex: 2,
        textFingerprint: 'copied-passage',
      },
    },
  },
}

function tool(description = 'Read the current page'): ToolDefinition {
  return {
    name: 'get_reading_context',
    description,
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

class SerialLocks implements AiConnectionLockPort {
  #tail = Promise.resolve()

  request<T>(_name: string, _options: { readonly mode: 'exclusive' }, callback: () => T | Promise<T>): Promise<T> {
    const result = this.#tail.then(callback)
    this.#tail = result.then(() => undefined, () => undefined)
    return result
  }
}

class GateFirstLock implements AiConnectionLockPort {
  #tail: Promise<unknown>
  #release!: () => void

  constructor() {
    this.#tail = new Promise<void>((resolve) => { this.#release = resolve })
  }

  release(): void { this.#release() }

  request<T>(_name: string, _options: { readonly mode: 'exclusive' }, callback: () => T | Promise<T>): Promise<T> {
    const result = this.#tail.then(callback)
    this.#tail = result.then(() => undefined, () => undefined)
    return result
  }
}

function platform(options: {
  url?: string
  session?: Storage
  local?: Storage
  locks?: AiConnectionLockPort
  now?: () => number
  generation?: () => string
} = {}) {
  let url = options.url ?? 'https://bookhand.test/read?view=study'
  const navigations: string[] = []
  const replacements: string[] = []
  let reloads = 0
  let generation = 0
  const value: AiConnectionPlatformPort = {
    sessionStorage: options.session ?? sessionStorage,
    localStorage: options.local ?? localStorage,
    locks: options.locks ?? new SerialLocks(),
    currentUrl: () => url,
    replaceUrl: (next) => { replacements.push(next); url = next },
    navigate: (next) => { navigations.push(next) },
    reload: () => { reloads += 1 },
    now: options.now ?? (() => Date.now()),
    createGeneration: options.generation ?? (() => `generation-${++generation}`),
  }
  return {
    value,
    navigations,
    replacements,
    reloads: () => reloads,
    setUrl(next: string) { url = next },
  }
}

function metadata(providerUrl = 'https://openclaw.test') {
  const provider = new URL(providerUrl)
  const origin = provider.origin
  const issuer = `${origin}/agent-connect`
  return {
    authorization: {
      issuer,
      authorization_endpoint: `${origin}/agent-connect/oauth/authorize`,
      token_endpoint: `${origin}/agent-connect/oauth/token`,
      revocation_endpoint: `${origin}/agent-connect/oauth/revoke`,
      pushed_authorization_request_endpoint: `${origin}/agent-connect/oauth/par`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['responses'],
      authorization_details_types_supported: ['agent_connect'],
      require_pushed_authorization_requests: true,
      authorization_response_iss_parameter_supported: true,
    },
    resource: {
      resource: `${origin}/agent-connect/v1/responses`,
      authorization_servers: [issuer],
      scopes_supported: ['responses'],
      bearer_methods_supported: ['header'],
      authorization_details_types_supported: ['agent_connect'],
      agent_connect_model: 'openclaw/default',
    },
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function fixtureFetch(options: {
  initialExpiresIn?: number
  tokenResponse?: Promise<Response>
  revokeResponse?: Response
  providerUrl?: string
} = {}) {
  const calls: { url: string; body?: URLSearchParams }[] = []
  let tokenCalls = 0
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body instanceof URLSearchParams ? init.body : undefined
    calls.push({ url, ...(body ? { body } : {}) })
    const profile = metadata(options.providerUrl)
    if (url.endsWith('/.well-known/oauth-authorization-server')
      || url.endsWith('/.well-known/oauth-authorization-server/agent-connect')) return json(profile.authorization)
    if (url.endsWith('/.well-known/oauth-protected-resource')
      || url.endsWith('/.well-known/oauth-protected-resource/agent-connect/v1/responses')) return json(profile.resource)
    if (url.endsWith('/agent-connect/oauth/par')) {
      return json({ request_uri: 'urn:ietf:params:oauth:request_uri:bookhand', expires_in: 600 })
    }
    if (url.endsWith('/agent-connect/oauth/token')) {
      tokenCalls += 1
      if (options.tokenResponse && body?.get('grant_type') === 'refresh_token') {
        return options.tokenResponse
      }
      return json({
        access_token: `access-${tokenCalls}`,
        refresh_token: `refresh-${tokenCalls}`,
        token_type: 'Bearer',
        expires_in: options.initialExpiresIn ?? 3600,
        refresh_token_expires_in: 86400,
        scope: 'responses',
      })
    }
    if (url.endsWith('/agent-connect/oauth/revoke')) return options.revokeResponse ?? new Response(null)
    throw new Error(`Unexpected fixture request: ${url}`)
  })
  return { fetch, calls, tokenCalls: () => tokenCalls }
}

function modelCapture() {
  let getAccessToken: ((signal?: AbortSignal) => string | Promise<string>) | undefined
  const createModel = vi.fn((options: { getAccessToken: (signal?: AbortSignal) => string | Promise<string> }) => {
    getAccessToken = options.getAccessToken
    return {} as LanguageModel
  })
  return { createModel, getAccessToken: () => getAccessToken! }
}

function callbackFromPending(base = 'https://bookhand.test/read?view=study') {
  const pending = JSON.parse(sessionStorage.getItem(AI_PENDING_AUTHORIZATION_KEY)!) as {
    transaction: string
  }
  const transaction = JSON.parse(pending.transaction) as { state: string; issuer: string }
  return `${base}&code=code-1&state=${encodeURIComponent(transaction.state)}&iss=${encodeURIComponent(transaction.issuer)}`
}

async function authorizedStore(options: {
  historyFetch: typeof globalThis.fetch
  tools?: readonly ToolDefinition[]
  initialExpiresIn?: number
  tokenResponse?: Promise<Response>
  generation?: () => string
  providerUrl?: string
}) {
  const fixture = fixtureFetch({
    initialExpiresIn: options.initialExpiresIn,
    tokenResponse: options.tokenResponse,
    providerUrl: options.providerUrl,
  })
  const browser = platform({ generation: options.generation })
  const store = new AiConnectionStore({
    sdk: {
      createModel: () => ({}) as LanguageModel,
      discover: (sdkOptions) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...sdkOptions, fetch: fixture.fetch })),
      beginAuthorization: (sdkOptions) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...sdkOptions, fetch: fixture.fetch })),
      completeAuthorization: (sdkOptions) => import('@open-agent-connect/web').then(({ completeOpenClawAuthorization }) => completeOpenClawAuthorization({ ...sdkOptions, fetch: fixture.fetch })),
      createAccessTokenGetter: (sdkOptions) => createOpenClawAccessTokenGetter({ ...sdkOptions, fetch: fixture.fetch }),
      revoke: (sdkOptions) => import('@open-agent-connect/web').then(({ revokeOpenClawConnection }) => revokeOpenClawConnection({ ...sdkOptions, fetch: fixture.fetch })),
    },
    platform: browser.value,
    fetch: options.historyFetch,
  })
  const tools = options.tools ?? [tool()]
  browser.setUrl(await startAuthorization(store, tools, options.providerUrl))
  await store.finishAuthorization()
  return { store, browser, fixture, tools }
}

async function startAuthorization(
  store: AiConnectionStore,
  tools: readonly ToolDefinition[] = [tool()],
  providerUrl = 'https://openclaw.test',
) {
  store.setProviderUrl(providerUrl)
  await store.authorize({ tools, intent, beforeRedirect: async () => undefined })
  return callbackFromPending()
}

describe('AiConnectionStore with the public OpenClaw SDK', () => {
  it('runs discovery, PAR and callback exchange while preserving an owned copied intent', async () => {
    const fixture = fixtureFetch()
    const browser = platform()
    const model = modelCapture()
    const tools = [tool()]
    const store = new AiConnectionStore({
      sdk: { createModel: model.createModel, discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })) , beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })), completeAuthorization: (options) => import('@open-agent-connect/web').then(({ completeOpenClawAuthorization }) => completeOpenClawAuthorization({ ...options, fetch: fixture.fetch })) },
      platform: browser.value,
    })
    const listener = vi.fn()
    store.subscribe(listener)

    const callback = await startAuthorization(store, tools)
    const pendingRaw = sessionStorage.getItem(AI_PENDING_AUTHORIZATION_KEY)!
    expect(pendingRaw).toContain('Explain this passage')
    expect(pendingRaw).not.toContain('access-')
    expect(browser.navigations[0]).toMatch(/^https:\/\/openclaw\.test\/agent-connect\/oauth\/authorize\?/)
    expect(readPendingAiIntent(callback)).toEqual(intent)
    expect(inspectPendingAiReturn(callback)).toEqual({ kind: 'owned', intent })
    expect(readPendingAiIntent(callback.replace('iss=', 'iss=https%3A%2F%2Fother.test&ignored='))).toBeUndefined()

    browser.setUrl(callback)
    const first = store.finishAuthorization()
    const second = store.finishAuthorization()
    expect(second).toBe(first)
    await expect(first).resolves.toEqual(intent)
    expect(fixture.tokenCalls()).toBe(1)
    expect(sessionStorage.getItem(AI_PENDING_AUTHORIZATION_KEY)).toBeNull()
    expect(browser.replacements).toEqual(['https://bookhand.test/read?view=study'])
    const generation = store.getSnapshot().generation
    expect(store.getSnapshot()).toEqual({
      phase: 'connected',
      providerUrl: 'https://openclaw.test/agent-connect',
      experience: 'tailscale',
      generation,
    })
    expect(store.getExecution(tools)).toEqual({ generation, model: expect.anything() })
    expect(listener).toHaveBeenCalled()
    expect([...Array(localStorage.length)].map((_, index) => localStorage.key(index)))
      .toContainEqual(expect.stringMatching(/^bookhand\.ai\.oauth\.consumed\./))
    expect(localStorage.getItem('bookhand.ai.connection.v1')).toMatch(/access-|refresh-/)
    expect(sessionStorage.getItem(AI_PENDING_AUTHORIZATION_KEY)).toBeNull()
    expect(JSON.stringify(store.getSnapshot())).not.toMatch(/access-|refresh-|code-1/)
  })

  it('rediscovers a plugin callback from its verified issuer and preserves that provider address', async () => {
    const providerUrl = 'https://openclaw.test/agent-connect'
    const { store, fixture } = await authorizedStore({
      providerUrl,
      historyFetch: vi.fn<typeof globalThis.fetch>(),
    })

    expect(store.getSnapshot()).toMatchObject({ phase: 'connected', providerUrl })
    expect(fixture.calls.filter(({ url }) => url.includes('/.well-known/')).map(({ url }) => url)).toEqual([
      'https://openclaw.test/.well-known/oauth-authorization-server/agent-connect',
      'https://openclaw.test/.well-known/oauth-protected-resource/agent-connect/v1/responses',
      'https://openclaw.test/.well-known/oauth-authorization-server/agent-connect',
      'https://openclaw.test/.well-known/oauth-protected-resource/agent-connect/v1/responses',
    ])
  })

  it('compares the complete fixed declaration snapshot, including nested schemas', async () => {
    const fixture = fixtureFetch()
    const browser = platform()
    const original = tool()
    const store = new AiConnectionStore({
      sdk: {
        createModel: () => ({}) as LanguageModel,
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
        completeAuthorization: (options) => import('@open-agent-connect/web').then(({ completeOpenClawAuthorization }) => completeOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      },
      platform: browser.value,
    })
    browser.setUrl(await startAuthorization(store, [original]))
    await store.finishAuthorization()

    expect(() => store.getExecution([tool('A changed description')])).toThrow(/authorize them again/)
    const changedSchema = tool()
    ;(changedSchema.inputSchema.properties as Record<string, unknown>).detail = { type: 'string' }
    expect(() => store.getExecution([changedSchema])).toThrow(/authorize them again/)
  })

  it('allows only one copied tab to claim and exchange the same callback', async () => {
    const fixture = fixtureFetch()
    const sharedLocks = new SerialLocks()
    const firstBrowser = platform({ locks: sharedLocks })
    const first = new AiConnectionStore({
      sdk: {
        createModel: () => ({}) as LanguageModel,
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
        completeAuthorization: (options) => import('@open-agent-connect/web').then(({ completeOpenClawAuthorization }) => completeOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      }, platform: firstBrowser.value,
    })
    const callback = await startAuthorization(first)
    const copiedStorage = memoryStorage()
    copiedStorage.setItem(AI_PENDING_AUTHORIZATION_KEY, sessionStorage.getItem(AI_PENDING_AUTHORIZATION_KEY)!)
    const secondBrowser = platform({ session: copiedStorage, locks: sharedLocks })
    const second = new AiConnectionStore({
      sdk: {
        createModel: () => ({}) as LanguageModel,
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        completeAuthorization: (options) => import('@open-agent-connect/web').then(({ completeOpenClawAuthorization }) => completeOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      }, platform: secondBrowser.value,
    })
    firstBrowser.setUrl(callback)
    secondBrowser.setUrl(callback)

    const [firstIntent, secondIntent] = await Promise.all([
      first.finishAuthorization(),
      second.finishAuthorization(),
    ])
    expect(firstIntent).toEqual(intent)
    expect(secondIntent).toEqual(intent)
    expect(fixture.tokenCalls()).toBe(1)
    expect([first.getSnapshot().phase, second.getSnapshot().phase].sort()).toEqual(['connected', 'error'])
    expect([first.getSnapshot().error, second.getSnapshot().error].filter(Boolean).join('')).toMatch(/already used/)
  })

  it('refuses a successful callback when lock or marker support is absent', async () => {
    const fixture = fixtureFetch()
    const browser = platform()
    const store = new AiConnectionStore({
      sdk: {
        createModel: () => ({}) as LanguageModel,
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      },
      platform: browser.value,
    })
    browser.setUrl(await startAuthorization(store))
    const finisher = new AiConnectionStore({
      sdk: {
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
      },
      platform: { ...browser.value, locks: undefined },
    })
    await expect(finisher.finishAuthorization()).resolves.toEqual(intent)
    expect(fixture.tokenCalls()).toBe(0)
    expect(finisher.getSnapshot()).toMatchObject({ phase: 'error', error: expect.stringMatching(/cannot safely finish/) })
  })

  it('fails closed at the consumed-marker bound without evicting live claims', async () => {
    const fixture = fixtureFetch()
    const browser = platform()
    const liveExpiry = new Date(Date.now() + 60_000).toISOString()
    for (let index = 0; index < 64; index += 1) {
      localStorage.setItem(`bookhand.ai.oauth.consumed.live-${index}`, JSON.stringify({ expiresAt: liveExpiry }))
    }
    // Adjacent expired entries exercise pruning without forward-loop skips.
    localStorage.setItem('bookhand.ai.oauth.consumed.expired-1', JSON.stringify({ expiresAt: '2000-01-01T00:00:00.000Z' }))
    localStorage.setItem('bookhand.ai.oauth.consumed.expired-2', 'malformed')
    const store = new AiConnectionStore({
      sdk: {
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      }, platform: browser.value,
    })
    browser.setUrl(await startAuthorization(store))

    await expect(store.finishAuthorization()).resolves.toEqual(intent)
    expect(store.getSnapshot()).toMatchObject({ phase: 'error', error: expect.stringMatching(/Too many recent/) })
    expect(fixture.tokenCalls()).toBe(0)
    expect([...Array(localStorage.length)].map((_, index) => localStorage.key(index))
      .filter((key) => key?.startsWith('bookhand.ai.oauth.consumed.'))).toHaveLength(64)
    for (let index = 0; index < 64; index += 1) {
      expect(localStorage.getItem(`bookhand.ai.oauth.consumed.live-${index}`)).not.toBeNull()
    }
  })

  it('routes an owned expired callback back to its draft but gates exchange with an actionable error', async () => {
    const fixture = fixtureFetch()
    const browser = platform()
    const store = new AiConnectionStore({
      sdk: {
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      }, platform: browser.value,
    })
    const callback = await startAuthorization(store)
    const pending = JSON.parse(sessionStorage.getItem(AI_PENDING_AUTHORIZATION_KEY)!) as Record<string, unknown>
    pending.expiresAt = '2000-01-01T00:00:00.000Z'
    sessionStorage.setItem(AI_PENDING_AUTHORIZATION_KEY, JSON.stringify(pending))
    browser.setUrl(callback)

    expect(readPendingAiIntent(callback)).toEqual(intent)
    expect(inspectPendingAiReturn(callback)).toEqual({ kind: 'owned', intent })
    await expect(store.finishAuthorization()).resolves.toEqual(intent)
    expect(fixture.tokenCalls()).toBe(0)
    expect(store.getSnapshot()).toMatchObject({ phase: 'error', error: expect.stringMatching(/expired/) })
    expect(browser.replacements).toEqual(['https://bookhand.test/read?view=study'])
  })

  it('rechecks transaction expiry after delayed discovery before claiming or exchanging', async () => {
    let now = Date.now()
    let releaseDiscovery!: () => void
    const delayedDiscovery = new Promise<void>((resolve) => { releaseDiscovery = resolve })
    let discoveryCount = 0
    const fixture = fixtureFetch()
    const browser = platform({ now: () => now })
    const store = new AiConnectionStore({
      sdk: {
        discover: async (options) => {
          discoveryCount += 1
          const provider = await import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch }))
          if (discoveryCount === 2) await delayedDiscovery
          return provider
        },
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      }, platform: browser.value,
    })
    const callback = await startAuthorization(store)
    const pending = JSON.parse(sessionStorage.getItem(AI_PENDING_AUTHORIZATION_KEY)!) as { expiresAt: string }
    browser.setUrl(callback)
    const finishing = store.finishAuthorization()
    await vi.waitFor(() => expect(discoveryCount).toBe(2))
    now = Date.parse(pending.expiresAt) + 1
    releaseDiscovery()

    await expect(finishing).resolves.toEqual(intent)
    expect(store.getSnapshot()).toMatchObject({ phase: 'error', error: expect.stringMatching(/expired/) })
    expect(fixture.tokenCalls()).toBe(0)
    expect([...Array(localStorage.length)].map((_, index) => localStorage.key(index))
      .filter((key) => key?.startsWith('bookhand.ai.oauth.consumed.'))).toHaveLength(0)
  })

  it('surfaces a strictly invalid owned callback without consuming its transaction', async () => {
    const fixture = fixtureFetch()
    const browser = platform()
    const store = new AiConnectionStore({
      sdk: {
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      }, platform: browser.value,
    })
    const callback = `${await startAuthorization(store)}&foreign=1`
    const pending = sessionStorage.getItem(AI_PENDING_AUTHORIZATION_KEY)
    browser.setUrl(callback)

    expect(readPendingAiIntent(callback)).toEqual(intent)
    expect(inspectPendingAiReturn(callback)).toEqual({
      kind: 'invalid',
      intent,
      message: expect.stringMatching(/could not be verified/),
    })
    await expect(store.finishAuthorization()).resolves.toEqual(intent)
    expect(store.getSnapshot()).toMatchObject({ phase: 'error', error: expect.stringMatching(/callback was invalid/) })
    expect(sessionStorage.getItem(AI_PENDING_AUTHORIZATION_KEY)).toBe(pending)
    expect(browser.replacements).toHaveLength(0)
    expect(fixture.fetch).not.toHaveBeenCalledWith(
      'https://openclaw.test/agent-connect/oauth/token', expect.anything(),
    )
  })

  it('reports malformed local return bytes as dismiss-only recovery and explicitly clears only local pending', () => {
    sessionStorage.setItem(AI_PENDING_AUTHORIZATION_KEY, JSON.stringify({
      version: 1,
      transaction: '{not an SDK transaction}',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      intent,
    }))
    const callback = 'https://bookhand.test/read?code=code-1&state=unknown&iss=https%3A%2F%2Fother.test'

    expect(readPendingAiIntent(callback)).toBeUndefined()
    expect(inspectPendingAiReturn(callback)).toEqual({
      kind: 'invalid',
      intent,
      message: expect.stringMatching(/invalid/),
    })
    expect(sessionStorage.getItem(AI_PENDING_AUTHORIZATION_KEY)).not.toBeNull()
    expect(inspectPendingAiReturn('https://bookhand.test/read')).toBeUndefined()

    const browser = platform({ url: callback })
    const store = new AiConnectionStore({ platform: browser.value })
    store.dismissPendingAuthorization()
    expect(sessionStorage.getItem(AI_PENDING_AUTHORIZATION_KEY)).toBeNull()
    expect(inspectPendingAiReturn(callback)).toBeUndefined()
    expect(browser.replacements).toHaveLength(0)
  })

  it('keeps one getter per generation, single-flights refresh, and rejects late CAS save', async () => {
    let resolveRefresh!: (response: Response) => void
    const refreshResponse = new Promise<Response>((resolve) => { resolveRefresh = resolve })
    const fixture = fixtureFetch({ initialExpiresIn: 1, tokenResponse: refreshResponse })
    const browser = platform()
    const model = modelCapture()
    const store = new AiConnectionStore({
      sdk: {
        createModel: model.createModel,
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
        completeAuthorization: (options) => import('@open-agent-connect/web').then(({ completeOpenClawAuthorization }) => completeOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
        createAccessTokenGetter: (options) => createOpenClawAccessTokenGetter({ ...options, fetch: fixture.fetch }),
      }, platform: browser.value,
    })
    browser.setUrl(await startAuthorization(store))
    await store.finishAuthorization()
    const getter = model.getAccessToken()
    const refreshOne = getter()
    const refreshTwo = getter()
    await vi.waitFor(() => expect(fixture.calls.filter(({ body }) => body?.get('grant_type') === 'refresh_token')).toHaveLength(1))
    store.setProviderUrl('https://replacement.test')
    resolveRefresh(json({
      access_token: 'late-access', refresh_token: 'late-refresh', token_type: 'Bearer',
      expires_in: 3600, refresh_token_expires_in: 86400, scope: 'responses',
    }))
    await expect(refreshOne).rejects.toThrow(/changed/)
    await expect(refreshTwo).rejects.toThrow(/changed/)
    expect(store.getSnapshot()).toEqual({
      phase: 'disconnected', providerUrl: 'https://replacement.test', experience: 'tailscale',
    })
  })

  it('retains the local generation through a successful single-flight token rotation', async () => {
    const fixture = fixtureFetch({
      initialExpiresIn: 1,
      tokenResponse: Promise.resolve(json({
        access_token: 'rotated-access', refresh_token: 'rotated-refresh', token_type: 'Bearer',
        expires_in: 3600, refresh_token_expires_in: 86400, scope: 'responses',
      })),
    })
    const browser = platform()
    const model = modelCapture()
    const tools = [tool()]
    const store = new AiConnectionStore({
      sdk: {
        createModel: model.createModel,
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
        completeAuthorization: (options) => import('@open-agent-connect/web').then(({ completeOpenClawAuthorization }) => completeOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
        createAccessTokenGetter: (options) => createOpenClawAccessTokenGetter({ ...options, fetch: fixture.fetch }),
      }, platform: browser.value,
    })
    browser.setUrl(await startAuthorization(store, tools))
    await store.finishAuthorization()
    const generation = store.getSnapshot().generation

    await expect(Promise.all([model.getAccessToken()(), model.getAccessToken()()]))
      .resolves.toEqual(['rotated-access', 'rotated-access'])
    expect(fixture.calls.filter(({ body }) => body?.get('grant_type') === 'refresh_token')).toHaveLength(1)
    expect(store.getSnapshot()).toMatchObject({ phase: 'connected', generation })
    expect(store.getExecution(tools).generation).toBe(generation)
  })

  it('rechecks the absolute grant after asynchronous persisted-record validation', async () => {
    const fixture = fixtureFetch()
    const seedBrowser = platform()
    const seed = new AiConnectionStore({
      sdk: {
        createModel: () => ({}) as LanguageModel,
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
        completeAuthorization: (options) => import('@open-agent-connect/web').then(({ completeOpenClawAuthorization }) => completeOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      },
      platform: seedBrowser.value,
    })
    seedBrowser.setUrl(await startAuthorization(seed))
    await seed.finishAuthorization()
    const base = Date.now()
    const saved = JSON.parse(localStorage.getItem(AI_CONNECTION_KEY)!) as {
      grantExpiresAt: string
      connection: { refreshTokenExpiresAt: string }
    }
    saved.grantExpiresAt = new Date(base + 1_000).toISOString()
    saved.connection.refreshTokenExpiresAt = saved.grantExpiresAt
    localStorage.setItem(AI_CONNECTION_KEY, JSON.stringify(saved))

    let nowCalls = 0
    const model = modelCapture()
    const restoring = new AiConnectionStore({
      sdk: { createModel: model.createModel },
      platform: platform({ now: () => nowCalls++ === 0 ? base : base + 2_000 }).value,
    })
    await restoring.ready

    expect(restoring.getSnapshot()).toMatchObject({ phase: 'error', error: expect.stringMatching(/expired/) })
    expect(model.createModel).not.toHaveBeenCalled()
    expect(localStorage.getItem(AI_CONNECTION_KEY)).toBeNull()
  })

  it('does not let a late authorization completion resurrect a disconnected store', async () => {
    let resolveToken!: (response: Response) => void
    const token = new Promise<Response>((resolve) => { resolveToken = resolve })
    const fixture = fixtureFetch()
    const originalFetch = fixture.fetch.getMockImplementation()!
    fixture.fetch.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/agent-connect/oauth/token')) return token
      return originalFetch(input, init)
    })
    const browser = platform()
    const store = new AiConnectionStore({
      sdk: {
        createModel: () => ({}) as LanguageModel,
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
        completeAuthorization: (options) => import('@open-agent-connect/web').then(({ completeOpenClawAuthorization }) => completeOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      }, platform: browser.value,
    })
    browser.setUrl(await startAuthorization(store))
    const finishing = store.finishAuthorization()
    await vi.waitFor(() => expect(fixture.fetch).toHaveBeenCalledWith(
      'https://openclaw.test/agent-connect/oauth/token', expect.anything(),
    ))
    await store.disconnect()
    resolveToken(json({
      access_token: 'late-access', refresh_token: 'late-refresh', token_type: 'Bearer',
      expires_in: 3600, refresh_token_expires_in: 86400, scope: 'responses',
    }))
    await expect(finishing).resolves.toBeUndefined()
    expect(store.getSnapshot().phase).toBe('disconnected')
    expect(() => store.getExecution([tool()])).toThrow(/Connect your AI/)
  })

  it('does not let a resync queued during early disconnect reinstall the retired identity', async () => {
    const fixture = fixtureFetch()
    const seedBrowser = platform()
    const seed = new AiConnectionStore({
      sdk: {
        createModel: () => ({}) as LanguageModel,
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
        completeAuthorization: (options) => import('@open-agent-connect/web').then(({ completeOpenClawAuthorization }) => completeOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      },
      platform: seedBrowser.value,
    })
    seedBrowser.setUrl(await startAuthorization(seed))
    await seed.finishAuthorization()

    const gate = new GateFirstLock()
    const racingBrowser = platform({ locks: gate })
    const racing = new AiConnectionStore({
      sdk: {
        createModel: () => ({}) as LanguageModel,
        revoke: (options) => import('@open-agent-connect/web').then(({ revokeOpenClawConnection }) => revokeOpenClawConnection({ ...options, fetch: fixture.fetch })),
      },
      platform: racingBrowser.value,
    })
    const disconnecting = racing.disconnect()
    expect(racing.getSnapshot().phase).toBe('disconnected')
    racing.subscribe(() => undefined)
    gate.release()
    await disconnecting

    expect(racing.getSnapshot().phase).toBe('disconnected')
    expect(() => racing.getExecution([tool()])).toThrow(/Connect your AI/)
    expect(localStorage.getItem(AI_CONNECTION_KEY)).toBeNull()
  })

  it('rejects an old callback after another tab disconnects its matching pending epoch', async () => {
    const fixture = fixtureFetch()
    const sharedLocks = new SerialLocks()
    let nextGeneration = 0
    const generation = () => `shared-${++nextGeneration}`
    const firstBrowser = platform({ locks: sharedLocks, generation })
    const first = new AiConnectionStore({
      sdk: {
        createModel: () => ({}) as LanguageModel,
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
        completeAuthorization: (options) => import('@open-agent-connect/web').then(({ completeOpenClawAuthorization }) => completeOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      },
      platform: firstBrowser.value,
    })
    const callback = await startAuthorization(first)
    const copiedSession = memoryStorage()
    copiedSession.setItem(AI_PENDING_AUTHORIZATION_KEY, sessionStorage.getItem(AI_PENDING_AUTHORIZATION_KEY)!)
    const otherBrowser = platform({ session: copiedSession, locks: sharedLocks, generation })
    const other = new AiConnectionStore({ platform: otherBrowser.value })
    await other.disconnect()

    firstBrowser.setUrl(callback)
    await expect(first.finishAuthorization()).resolves.toBeUndefined()
    expect(first.getSnapshot().phase).toBe('disconnected')
    expect(fixture.tokenCalls()).toBe(1)
    expect(localStorage.getItem(AI_CONNECTION_KEY)).toBeNull()
  })

  it('rejects an old callback after a newer tab starts authorization', async () => {
    const fixture = fixtureFetch()
    const sharedLocks = new SerialLocks()
    let nextGeneration = 0
    const generation = () => `shared-${++nextGeneration}`
    const firstBrowser = platform({ locks: sharedLocks, generation })
    const first = new AiConnectionStore({
      sdk: {
        createModel: () => ({}) as LanguageModel,
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
        completeAuthorization: (options) => import('@open-agent-connect/web').then(({ completeOpenClawAuthorization }) => completeOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      },
      platform: firstBrowser.value,
    })
    const callback = await startAuthorization(first)
    const replacementBrowser = platform({ session: memoryStorage(), locks: sharedLocks, generation })
    const replacement = new AiConnectionStore({
      sdk: {
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      },
      platform: replacementBrowser.value,
    })
    replacement.setProviderUrl('https://openclaw.test')
    await replacement.authorize({ tools: [tool()], intent, beforeRedirect: async () => undefined })

    firstBrowser.setUrl(callback)
    await expect(first.finishAuthorization()).resolves.toBeUndefined()
    expect(first.getSnapshot().phase).toBe('disconnected')
    expect(fixture.tokenCalls()).toBe(1)
    expect(localStorage.getItem(AI_CONNECTION_KEY)).toBeNull()
  })

  it('reloads after redirect teardown failure and removes only its own pending transaction', async () => {
    const fixture = fixtureFetch()
    const browser = platform()
    const store = new AiConnectionStore({
      sdk: {
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
      }, platform: browser.value,
    })
    store.setProviderUrl('https://openclaw.test')
    await expect(store.authorize({
      tools: [tool()], intent, beforeRedirect: async () => { throw new Error('SQLite disposal failed') },
    })).rejects.toThrow('SQLite disposal failed')
    expect(browser.reloads()).toBe(1)
    expect(browser.navigations).toHaveLength(0)
    expect(sessionStorage.getItem(AI_PENDING_AUTHORIZATION_KEY)).toBeNull()
    expect(store.getSnapshot()).toMatchObject({ phase: 'error', error: 'SQLite disposal failed' })
  })

  it('clears credentials before revocation and reports an explicit revocation error', async () => {
    const fixture = fixtureFetch({ revokeResponse: json({ error: 'temporarily_unavailable' }, 503) })
    const browser = platform()
    const store = new AiConnectionStore({
      sdk: {
        createModel: () => ({}) as LanguageModel,
        discover: (options) => import('@open-agent-connect/web').then(({ discoverOpenClawProvider }) => discoverOpenClawProvider({ ...options, fetch: fixture.fetch })),
        beginAuthorization: (options) => import('@open-agent-connect/web').then(({ beginOpenClawAuthorization }) => beginOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
        completeAuthorization: (options) => import('@open-agent-connect/web').then(({ completeOpenClawAuthorization }) => completeOpenClawAuthorization({ ...options, fetch: fixture.fetch })),
        revoke: (options) => import('@open-agent-connect/web').then(({ revokeOpenClawConnection }) => revokeOpenClawConnection({ ...options, fetch: fixture.fetch })),
      }, platform: browser.value,
    })
    browser.setUrl(await startAuthorization(store))
    await store.finishAuthorization()
    await expect(store.disconnect()).rejects.toThrow(/could not be revoked/)
    expect(() => store.getExecution([tool()])).toThrow(/Connect your AI/)
    expect(store.getSnapshot()).toMatchObject({ phase: 'error', error: expect.stringMatching(/could not be revoked/) })
  })

  it('binds authenticated history reads to the approved catalog, scope and exact routes', async () => {
    const conversationId = '0123456789abcdef0123456789abcdef0123'
    const historyFetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = String(input)
      if (url === 'https://openclaw.test/agent-connect/v1/conversations') {
        return json({ conversations: [{
          conversationId,
          expiresAt: 2_000_000_000_000,
          canContinue: true,
          previousResponseId: 'resp_1',
        }] })
      }
      if (url === `https://openclaw.test/agent-connect/v1/conversations/${conversationId}/history`) {
        return json({
          conversationId,
          expiresAt: 2_000_000_000_000,
          canContinue: true,
          previousResponseId: 'resp_1',
          projection: 'execution-history',
          entries: [{ kind: 'assistant', text: 'Restored' }],
          truncated: false,
        })
      }
      throw new Error(`Unexpected history URL: ${url}; ${String(init?.method)}`)
    })
    const tools = [tool()]
    const { store } = await authorizedStore({ historyFetch, tools })
    const access = store.getHistoryAccess(tools)
    const persisted = JSON.parse(localStorage.getItem(AI_CONNECTION_KEY)!) as { id: string }

    expect(access.scopeId).toBe(persisted.id)
    expect(access.generation).toBe(store.getSnapshot().generation)
    expect(() => store.getHistoryAccess([tool('Changed after consent')])).toThrow(/authorize them again/)
    await expect(access.list(new AbortController().signal)).resolves.toHaveLength(1)
    await expect(access.history(conversationId, new AbortController().signal)).resolves.toMatchObject({
      conversationId,
      entries: [{ kind: 'assistant', text: 'Restored' }],
    })

    expect(historyFetch).toHaveBeenCalledTimes(2)
    expect(historyFetch.mock.calls.map(([input]) => String(input))).toEqual([
      'https://openclaw.test/agent-connect/v1/conversations',
      `https://openclaw.test/agent-connect/v1/conversations/${conversationId}/history`,
    ])
    for (const [, init] of historyFetch.mock.calls) {
      expect(init).toMatchObject({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: expect.any(AbortSignal),
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer access-1',
        },
      })
      expect(Object.keys(init?.headers as Record<string, string>)).not.toContain('origin')
      expect(init?.body).toBeUndefined()
    }
    expect(JSON.stringify(access)).not.toContain('access-1')
  })

  it('preserves the persistent history scope through token refresh and reload', async () => {
    const historyFetch = vi.fn<typeof globalThis.fetch>(async () => json({ conversations: [] }))
    let seedGeneration = 0
    const { store, tools } = await authorizedStore({
      historyFetch,
      initialExpiresIn: 1,
      tokenResponse: Promise.resolve(json({
        access_token: 'rotated-access',
        refresh_token: 'rotated-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token_expires_in: 86400,
        scope: 'responses',
      })),
      generation: () => `seed-${++seedGeneration}`,
    })
    const before = store.getHistoryAccess(tools)
    await before.list(new AbortController().signal)
    const afterRefresh = store.getHistoryAccess(tools)
    expect(afterRefresh.scopeId).toBe(before.scopeId)
    expect(afterRefresh.generation).toBe(before.generation)
    expect(historyFetch.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer rotated-access' }),
    })

    let reloadGeneration = 0
    const reloaded = new AiConnectionStore({
      sdk: { createModel: () => ({}) as LanguageModel },
      platform: platform({ generation: () => `reload-${++reloadGeneration}` }).value,
      fetch: historyFetch,
    })
    await reloaded.ready
    const afterReload = reloaded.getHistoryAccess(tools)
    expect(afterReload.scopeId).toBe(before.scopeId)
    expect(afterReload.generation).not.toBe(before.generation)
    await expect(afterReload.list(new AbortController().signal)).resolves.toEqual([])
  })

  it.each([
    [404, 'conversation_unavailable'],
    [409, 'conversation_changed'],
  ])('maps only the structured %i/%s response to unavailable history', async (status, code) => {
    const historyFetch = vi.fn<typeof globalThis.fetch>(async () => json({
      error: { type: 'invalid_request_error', code, message: 'Private provider detail' },
    }, status))
    const { store, tools } = await authorizedStore({ historyFetch })
    await expect(store.getHistoryAccess(tools).history(
      '0123456789abcdef0123456789abcdef0123',
      new AbortController().signal,
    )).rejects.toBeInstanceOf(ConversationHistoryUnavailableError)
  })

  it.each([
    [404, 'not_found'],
    [409, 'other_conflict'],
    [401, 'invalid_application_credential'],
    [403, 'forbidden'],
    [502, 'history_unavailable'],
  ])('keeps the unrecognized %i/%s response recoverable', async (status, code) => {
    const historyFetch = vi.fn<typeof globalThis.fetch>(async () => json({
      error: { type: 'invalid_request_error', code, message: 'Private provider detail' },
    }, status))
    const { store, tools } = await authorizedStore({ historyFetch })
    let caught: unknown
    try {
      await store.getHistoryAccess(tools).list(new AbortController().signal)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(ConversationHistoryUnavailableError)
    expect(caught).toBeInstanceOf(OpenClawConnectionError)
    expect(caught).toMatchObject({
      code: status === 401 || status === 403 ? 'reauthorization_required' : 'transport_error',
      message: status === 401 || status === 403
        ? 'OpenClaw conversation history authorization failed'
        : 'OpenClaw conversation history request failed',
      status,
    })
    expect((caught as Error).message).not.toContain('Private provider detail')
  })

  it('retains network causes, rejects malformed success responses and preserves cancellation', async () => {
    const networkCause = new TypeError('fixture secret transport detail')
    const historyFetch = vi.fn<typeof globalThis.fetch>(async () => { throw networkCause })
    const { store, tools } = await authorizedStore({ historyFetch })
    const access = store.getHistoryAccess(tools)

    await expect(access.list(new AbortController().signal)).rejects.toMatchObject({
      code: 'transport_error',
      message: 'OpenClaw conversation history request failed',
      cause: networkCause,
    })
    historyFetch.mockResolvedValueOnce(json({ conversations: [{ expiresAt: 'wrong' }] }))
    await expect(access.list(new AbortController().signal)).rejects.toThrow(/invalid conversation history response/)

    const controller = new AbortController()
    controller.abort(new DOMException('Stopped by Tutor', 'AbortError'))
    await expect(access.list(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Stopped by Tutor',
    })
    expect(historyFetch).toHaveBeenCalledTimes(2)
  })

  it('rejects a history completion after disconnect wins the identity race', async () => {
    let resolveHistory!: (response: Response) => void
    const historyFetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>((resolve) => {
      resolveHistory = resolve
    }))
    const { store, tools } = await authorizedStore({ historyFetch })
    const access = store.getHistoryAccess(tools)
    const reading = access.list(new AbortController().signal)
    await vi.waitFor(() => expect(historyFetch).toHaveBeenCalledTimes(1))

    await store.disconnect()
    resolveHistory(json({ conversations: [] }))
    await expect(reading).rejects.toThrow(/connection changed/)
    expect(() => store.getHistoryAccess(tools)).toThrow(/Connect your AI/)
  })

  it('does not dispatch history after disconnect wins the post-token SDK await gap', async () => {
    const historyFetch = vi.fn<typeof globalThis.fetch>(async () => json({ conversations: [] }))
    const { store, tools } = await authorizedStore({ historyFetch })
    const access = store.getHistoryAccess(tools)
    let checks = 0
    let disconnecting: Promise<void> | undefined
    const signal = {
      aborted: false,
      reason: undefined,
      throwIfAborted: () => {
        checks += 1
        // The seventh check is the SDK's post-token await boundary. Disconnecting
        // here must be observed by Bookhand's synchronous pre-dispatch fetch guard.
        if (checks === 7) disconnecting = store.disconnect()
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as AbortSignal

    await expect(access.list(signal)).rejects.toThrow(/connection changed/)
    await disconnecting
    expect(checks).toBeGreaterThanOrEqual(9)
    expect(historyFetch).not.toHaveBeenCalled()
    expect(() => store.getHistoryAccess(tools)).toThrow(/Connect your AI/)
  })
})

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
