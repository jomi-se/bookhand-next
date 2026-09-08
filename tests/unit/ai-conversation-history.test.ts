import {
  OpenClawConversationUnavailableError,
  createOpenClawConversationClient,
  type OpenClawConnection,
} from '@open-agent-connect/web'
import { describe, expect, it, vi } from 'vitest'
import { ConversationHistoryUnavailableError } from '../../src/ai/conversation-history.ts'

const conversationId = '0123456789abcdef0123456789abcdef0123'

function connection(endpoint = 'https://openclaw.test/v1/responses'): OpenClawConnection {
  return {
    version: 1,
    providerOrigin: 'https://openclaw.test',
    endpoint,
    clientId: 'https://bookhand.test',
    accessToken: 'not-used-directly',
    refreshToken: 'refresh-token',
    expiresAt: '2099-01-01T00:00:00.000Z',
    refreshTokenExpiresAt: '2099-01-02T00:00:00.000Z',
    model: 'openclaw/default',
    applicationTools: [],
    applicationToolsHash: 'A'.repeat(43),
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function clientReturning(value: unknown, endpoint?: string) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => json(value))
  return {
    client: createOpenClawConversationClient({
      connection: connection(endpoint),
      getAccessToken: async () => 'access-token',
      fetch,
    }),
    fetch,
  }
}

describe('conversation history SDK projection', () => {
  it('retains the SDK unavailable-error identity at the Tutor boundary', () => {
    expect(ConversationHistoryUnavailableError).toBe(OpenClawConversationUnavailableError)
  })

  it.each([
    ['standalone', 'https://openclaw.test/v1/responses', 'https://openclaw.test/v1/agent-connect/conversations'],
    ['plugin', 'https://openclaw.test/agent-connect/v1/responses', 'https://openclaw.test/agent-connect/v1/conversations'],
  ])('uses the real SDK projection and route for the %s layout', async (_layout, endpoint, conversationsUrl) => {
    const inert = '<img src=x onerror="globalThis.compromised=true"><script>bad()</script>'
    const getAccessToken = vi.fn(async () => 'access-token')
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input)
      if (url === conversationsUrl) {
        return json({
          conversations: [{
            conversationId,
            expiresAt: 2_000_000_000_000,
            canContinue: true,
            previousResponseId: 'resp_1',
            sessionKey: 'private-session',
          }],
          providerMetadata: { grant: 'private-grant' },
        })
      }
      if (url === `${conversationsUrl}/${conversationId}/history`) {
        return json({
          conversationId,
          expiresAt: 2_000_000_000_000,
          canContinue: true,
          previousResponseId: 'resp_1',
          projection: 'execution-history',
          entries: [
            { kind: 'input', text: inert, senderIsOwner: true, toolResult: 'secret' },
            { kind: 'assistant', text: 'Safe answer', reasoning: 'private chain' },
          ],
          truncated: false,
          system: 'private instructions',
        })
      }
      throw new Error(`Unexpected conversation URL: ${url}`)
    })
    const client = createOpenClawConversationClient({
      connection: connection(endpoint),
      getAccessToken,
      fetch,
    })
    const signal = new AbortController().signal

    const descriptors = await client.list({ signal })
    expect(descriptors).toEqual([{
      conversationId,
      expiresAt: 2_000_000_000_000,
      canContinue: true,
      previousResponseId: 'resp_1',
    }])
    expect(JSON.stringify(descriptors)).not.toContain('private')

    const history = await client.history(conversationId, { signal })
    expect(history).toEqual({
      conversationId,
      expiresAt: 2_000_000_000_000,
      canContinue: true,
      previousResponseId: 'resp_1',
      projection: 'execution-history',
      entries: [
        { kind: 'input', text: inert },
        { kind: 'assistant', text: 'Safe answer' },
      ],
      truncated: false,
    })
    expect(history.entries[0]?.text).toBe(inert)
    expect(JSON.stringify(history)).not.toMatch(/senderIsOwner|toolResult|reasoning|private/)
    expect(getAccessToken).toHaveBeenCalledTimes(2)
    expect(getAccessToken).toHaveBeenCalledWith(signal)
  })

  it('accepts pending descriptors only without a response head', async () => {
    const pending = clientReturning({
      conversations: [{ conversationId, expiresAt: 123, canContinue: false }],
    })
    await expect(pending.client.list()).resolves.toEqual([{
      conversationId,
      expiresAt: 123,
      canContinue: false,
    }])

    const malformed = clientReturning({
      conversations: [{
        conversationId,
        expiresAt: 123,
        canContinue: false,
        previousResponseId: 'resp_pending',
      }],
    })
    await expect(malformed.client.list()).rejects.toThrow(/invalid conversation history response/)
  })

  it('rejects malformed descriptor and projection shapes', async () => {
    const descriptor = {
      conversationId,
      expiresAt: 123,
      canContinue: true,
      previousResponseId: 'resp_1',
    }
    const malformed: unknown[] = [
      null,
      {},
      { conversations: 'not-an-array' },
      { conversations: [{ ...descriptor, expiresAt: '123' }] },
      { conversations: [{ ...descriptor, conversationId: '../history' }] },
      { conversations: [{ ...descriptor, previousResponseId: 'bad/id' }] },
      { conversations: Array.from({ length: 9 }, () => descriptor) },
    ]
    for (const value of malformed) {
      await expect(clientReturning(value).client.list()).rejects.toThrow(/invalid conversation history response/)
    }

    for (const value of [
      { ...descriptor, entries: [], truncated: false },
      {
        ...descriptor,
        projection: 'execution-history',
        entries: [{ kind: 'system', text: 'instructions' }],
        truncated: false,
      },
      {
        ...descriptor,
        projection: 'execution-history',
        entries: [{ kind: 'input', text: '' }],
        truncated: false,
      },
    ]) {
      await expect(clientReturning(value).client.history(conversationId))
        .rejects.toThrow(/invalid conversation history response/)
    }
  })

  it('enforces the SDK entry count, per-entry and aggregate text bounds', async () => {
    const descriptor = {
      conversationId,
      expiresAt: 123,
      canContinue: true,
      previousResponseId: 'resp_1',
      projection: 'execution-history',
      truncated: true,
    } as const
    await expect(clientReturning({
      ...descriptor,
      entries: Array.from({ length: 8 }, () => ({ kind: 'input', text: 'x'.repeat(16_384) })),
    }).client.history(conversationId)).resolves.toMatchObject({ entries: expect.any(Array) })
    await expect(clientReturning({
      ...descriptor,
      entries: [{ kind: 'input', text: 'x'.repeat(16_385) }],
    }).client.history(conversationId)).rejects.toThrow(/invalid conversation history response/)
    await expect(clientReturning({
      ...descriptor,
      entries: [
        ...Array.from({ length: 8 }, () => ({ kind: 'input', text: 'x'.repeat(16_384) })),
        { kind: 'assistant', text: 'overflow' },
      ],
    }).client.history(conversationId)).rejects.toThrow(/invalid conversation history response/)
    await expect(clientReturning({
      ...descriptor,
      entries: Array.from({ length: 201 }, () => ({ kind: 'input', text: 'x' })),
    }).client.history(conversationId)).rejects.toThrow(/invalid conversation history response/)
  })
})
