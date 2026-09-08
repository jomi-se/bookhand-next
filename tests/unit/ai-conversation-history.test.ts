import { describe, expect, it } from 'vitest'
import {
  parseConversationDescriptors,
  parseExecutionHistory,
} from '../../src/ai/conversation-history.ts'

const conversationId = '0123456789abcdef0123456789abcdef0123'

describe('conversation history projection validation', () => {
  it('copies only the exact descriptor and inert execution text allowlist', () => {
    const descriptors = parseConversationDescriptors({
      conversations: [{
        conversationId,
        expiresAt: 2_000_000_000_000,
        canContinue: true,
        previousResponseId: 'resp_1',
        sessionKey: 'private-session',
      }],
      providerMetadata: { grant: 'private-grant' },
    })
    expect(descriptors).toEqual([{
      conversationId,
      expiresAt: 2_000_000_000_000,
      canContinue: true,
      previousResponseId: 'resp_1',
    }])
    expect(JSON.stringify(descriptors)).not.toContain('private')

    const inert = '<img src=x onerror="globalThis.compromised=true"><script>bad()</script>'
    const history = parseExecutionHistory({
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
  })

  it('accepts pending descriptors only without a response head', () => {
    expect(parseConversationDescriptors({
      conversations: [{ conversationId, expiresAt: 123, canContinue: false }],
    })).toEqual([{ conversationId, expiresAt: 123, canContinue: false }])
    expect(() => parseConversationDescriptors({
      conversations: [{
        conversationId,
        expiresAt: 123,
        canContinue: false,
        previousResponseId: 'resp_pending',
      }],
    })).toThrow(/invalid conversation history response/)
  })

  it('rejects malformed descriptor and projection shapes', () => {
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
      expect(() => parseConversationDescriptors(value)).toThrow(/invalid conversation history response/)
    }

    expect(() => parseExecutionHistory({ ...descriptor, entries: [], truncated: false }))
      .toThrow(/invalid conversation history response/)
    expect(() => parseExecutionHistory({
      ...descriptor,
      projection: 'execution-history',
      entries: [{ kind: 'system', text: 'instructions' }],
      truncated: false,
    })).toThrow(/invalid conversation history response/)
    expect(() => parseExecutionHistory({
      ...descriptor,
      projection: 'execution-history',
      entries: [{ kind: 'input', text: '' }],
      truncated: false,
    })).toThrow(/invalid conversation history response/)
  })

  it('enforces the backend entry count, per-entry and aggregate text bounds', () => {
    const descriptor = {
      conversationId,
      expiresAt: 123,
      canContinue: true,
      previousResponseId: 'resp_1',
      projection: 'execution-history',
      truncated: true,
    } as const
    expect(parseExecutionHistory({
      ...descriptor,
      entries: Array.from({ length: 8 }, () => ({ kind: 'input', text: 'x'.repeat(16_384) })),
    }).entries).toHaveLength(8)
    expect(() => parseExecutionHistory({
      ...descriptor,
      entries: [{ kind: 'input', text: 'x'.repeat(16_385) }],
    })).toThrow(/invalid conversation history response/)
    expect(() => parseExecutionHistory({
      ...descriptor,
      entries: [
        ...Array.from({ length: 8 }, () => ({ kind: 'input', text: 'x'.repeat(16_384) })),
        { kind: 'assistant', text: 'overflow' },
      ],
    })).toThrow(/invalid conversation history response/)
    expect(() => parseExecutionHistory({
      ...descriptor,
      entries: Array.from({ length: 201 }, () => ({ kind: 'input', text: 'x' })),
    })).toThrow(/invalid conversation history response/)
  })
})
