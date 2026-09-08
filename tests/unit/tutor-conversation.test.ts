import { createAiSdkOpenResponsesModel, type JsonObject } from '@open-agent-connect/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LanguageModel } from 'ai'
import type {
  ConversationDescriptor,
  ExecutionHistory,
  TutorHistoryAccess,
} from '../../src/ai/conversation-history.ts'
import type { ToolDefinition } from '../../src/webmcp/model-context.ts'
import { errorResult, textResult, withOutputSchema } from '../../src/webmcp/model-context.ts'
import {
  TutorConversation,
  type TutorAiConnection,
  type TutorConversationSnapshot,
} from '../../src/tutor/conversation.ts'
import { diagnoseTutorFailure, formatTutorFailureDiagnostic } from '../../src/tutor/failure.ts'
import { lendBookhandTools } from '../../src/tutor/tool-adapter.ts'
import type {
  LastConversationPlatform,
  TutorConversationLock,
} from '../../src/tutor/last-conversation.ts'
import { LastConversationStore } from '../../src/tutor/last-conversation.ts'

const selection = {
  quote: 'A tiny change.',
  range: {
    sectionIndex: 1,
    startCfi: 'epubcfi(/6/2!/4/2:0)',
    endCfi: 'epubcfi(/6/2!/4/2:14)',
    textFingerprint: 'fnv1a-test',
  },
}

class FixtureConnection implements TutorAiConnection {
  #listeners = new Set<() => void>()
  #snapshot: ReturnType<TutorAiConnection['getSnapshot']> = {
    phase: 'connected',
    generation: 'generation-1',
  }
  readonly catalogs: (readonly ToolDefinition[])[] = []
  model: LanguageModel
  getHistoryAccess?: TutorAiConnection['getHistoryAccess']

  constructor(model: LanguageModel, historyAccess?: TutorHistoryAccess) {
    this.model = model
    if (historyAccess) {
      this.getHistoryAccess = (tools) => {
        this.catalogs.push(tools)
        return historyAccess
      }
    }
  }

  getSnapshot = () => this.#snapshot
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }
  getExecution = (tools: readonly ToolDefinition[]) => {
    this.catalogs.push(tools)
    if (this.#snapshot.phase !== 'connected' || !this.#snapshot.generation) {
      throw new Error('Connect your AI before sending.')
    }
    return { generation: this.#snapshot.generation, model: this.model }
  }
  setSnapshot(snapshot: ReturnType<TutorAiConnection['getSnapshot']>) {
    this.#snapshot = snapshot
    for (const listener of this.#listeners) listener()
  }
}

afterEach(() => vi.restoreAllMocks())

describe('TutorConversation through the real AI SDK stream/tool loop', () => {
  it('saves, restores, and follows up from the exact same-book head without replay', async () => {
    const bodies: JsonObject[] = []
    const model = fixtureModel(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as JsonObject)
      return eventStream(
        bodies.length === 1
          ? textEvents('resp-saved', 'Saved answer.')
          : textEvents('resp-followup', 'Continued answer.'),
      )
    })
    const storage = new MemoryStorage()
    const locks = new FixtureLocks()
    const platform = { storage, locks, now: () => 2_000 } satisfies LastConversationPlatform
    const descriptor: ConversationDescriptor = {
      conversationId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      expiresAt: 10_000,
      canContinue: true,
      previousResponseId: 'resp-saved',
    }
    const history: ExecutionHistory = {
      ...descriptor,
      projection: 'execution-history',
      entries: [
        { kind: 'input', text: 'First question' },
        { kind: 'assistant', text: 'Saved answer.' },
      ],
      truncated: false,
    }
    const historyAccess: TutorHistoryAccess = {
      scopeId: 'scope-1',
      generation: 'generation-1',
      list: vi.fn(async () => [
        {
          conversationId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          expiresAt: 20_000,
          canContinue: true,
          previousResponseId: 'newer-unrelated',
        },
        descriptor,
      ]),
      history: vi.fn(async () => history),
    }
    const connection = new FixtureConnection(model, historyAccess)
    const tools = [tool('read_source')]
    const first = new TutorConversation({
      bookId: 'book-1', tools, connection, restorePlatform: platform,
    })
    first.setDraft('First question')
    await first.send()
    first.dispose()
    await locks.settled()

    const restored = new TutorConversation({
      bookId: 'book-1', tools, connection, restorePlatform: platform,
    })
    restored.setDraft('Follow up only')
    await restored.restoreLastConversation()

    expect(bodies).toHaveLength(1)
    expect(historyAccess.list).toHaveBeenCalledTimes(1)
    expect(historyAccess.history).toHaveBeenCalledWith(
      descriptor.conversationId,
      expect.any(AbortSignal),
    )
    expect(restored.getSnapshot()).toMatchObject({
      draft: 'Follow up only',
      restoreState: 'restored',
      messages: [
        { role: 'input', text: 'First question', restored: true },
        { role: 'assistant', text: 'Saved answer.', restored: true },
      ],
    })

    await restored.send()

    expect(bodies).toHaveLength(2)
    expect(bodies[1]?.previous_response_id).toBe('resp-saved')
    expect(bodies[1]?.input).toEqual([expect.objectContaining({ role: 'user' })])
    expect(JSON.stringify(bodies[1]?.input)).toContain('Follow up only')
    expect(JSON.stringify(bodies[1]?.input)).not.toContain('First question')
    expect((bodies[1]?.tools as unknown[])).toHaveLength(1)
    restored.dispose()
  })

  it('preserves the association and draft across a transient restore error, then replaces on retry', async () => {
    const storage = new MemoryStorage()
    const locks = new FixtureLocks()
    const platform = { storage, locks, now: () => 2_000 } satisfies LastConversationPlatform
    new LastConversationStore(platform).save('book-1', 'scope-1', 'resp-saved')
    const descriptor: ConversationDescriptor = {
      conversationId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      expiresAt: 10_000,
      canContinue: true,
      previousResponseId: 'resp-saved',
    }
    let attempts = 0
    const access: TutorHistoryAccess = {
      scopeId: 'scope-1',
      generation: 'generation-1',
      list: vi.fn(async () => {
        attempts += 1
        if (attempts === 1) throw new Error('temporary 503')
        return [descriptor]
      }),
      history: vi.fn(async () => ({
        ...descriptor,
        projection: 'execution-history' as const,
        entries: [{ kind: 'assistant' as const, text: 'Recovered.' }],
        truncated: true,
      })),
    }
    const fetch = vi.fn(async () => eventStream(textEvents('unused', 'unused')))
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source')],
      connection: new FixtureConnection(fixtureModel(fetch), access),
      restorePlatform: platform,
    })
    conversation.setDraft('Keep my draft')

    await conversation.restoreLastConversation()
    expect(conversation.getSnapshot()).toMatchObject({
      draft: 'Keep my draft',
      restoreState: 'error',
      messages: [],
      canSend: false,
    })
    expect(new LastConversationStore(platform).read('book-1', 'scope-1')).toBeDefined()
    await conversation.send()
    expect(fetch).not.toHaveBeenCalled()

    await locks.settled()
    await conversation.retryRestore()
    expect(conversation.getSnapshot()).toMatchObject({
      draft: 'Keep my draft',
      restoreState: 'restored',
      restoredHistoryTruncated: true,
      messages: [{ role: 'assistant', text: 'Recovered.', restored: true }],
    })
    conversation.dispose()
  })

  it('does not let a late completed-turn lease overwrite a same-generation new conversation', async () => {
    const bodies: JsonObject[] = []
    const locks = new DelayedFirstLock()
    const storage = new MemoryStorage()
    const platform = { storage, locks, now: () => 2_000 } satisfies LastConversationPlatform
    const access: TutorHistoryAccess = {
      scopeId: 'scope-1',
      generation: 'generation-1',
      list: async () => [],
      history: async () => { throw new Error('unused') },
    }
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source')],
      connection: new FixtureConnection(fixtureModel(async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as JsonObject)
        return eventStream(textEvents(`resp-${bodies.length}`, `answer-${bodies.length}`))
      }), access),
      restorePlatform: platform,
    })
    conversation.setDraft('Old')
    const oldSend = conversation.send()
    await vi.waitFor(() => expect(locks.requests).toBe(1))

    conversation.newConversation()
    conversation.setDraft('New')
    await conversation.send()
    expect(conversation.getSnapshot().messages).toMatchObject([
      { role: 'user', text: 'New' },
      { role: 'assistant', text: 'answer-2' },
    ])
    expect(new LastConversationStore(platform).read('book-1', 'scope-1')?.previousResponseId)
      .toBe('resp-2')

    locks.admitFirst()
    await oldSend
    expect(conversation.getSnapshot().messages).toMatchObject([
      { role: 'user', text: 'New' },
      { role: 'assistant', text: 'answer-2' },
    ])
    expect(new LastConversationStore(platform).read('book-1', 'scope-1')?.previousResponseId)
      .toBe('resp-2')
    conversation.dispose()
  })

  it('clears a duplicated tab association when the saved head lease is already owned', async () => {
    const locks = new FixtureLocks()
    const firstStorage = new MemoryStorage()
    const duplicateStorage = new MemoryStorage()
    const firstPlatform = { storage: firstStorage, locks, now: () => 2_000 } satisfies LastConversationPlatform
    const duplicatePlatform = { storage: duplicateStorage, locks, now: () => 2_000 } satisfies LastConversationPlatform
    new LastConversationStore(firstPlatform).save('book-1', 'scope-1', 'resp-saved')
    new LastConversationStore(duplicatePlatform).save('book-1', 'scope-1', 'resp-saved')
    const descriptor: ConversationDescriptor = {
      conversationId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      expiresAt: 10_000,
      canContinue: true,
      previousResponseId: 'resp-saved',
    }
    const access: TutorHistoryAccess = {
      scopeId: 'scope-1',
      generation: 'generation-1',
      list: vi.fn(async () => [descriptor]),
      history: vi.fn(async () => ({
        ...descriptor,
        projection: 'execution-history' as const,
        entries: [{ kind: 'assistant' as const, text: 'Only one owner.' }],
        truncated: false,
      })),
    }
    const model = fixtureModel(async () => eventStream(textEvents('unused', 'unused')))
    const first = new TutorConversation({
      bookId: 'book-1', tools: [tool('read_source')],
      connection: new FixtureConnection(model, access), restorePlatform: firstPlatform,
    })
    const duplicate = new TutorConversation({
      bookId: 'book-1', tools: [tool('read_source')],
      connection: new FixtureConnection(model, access), restorePlatform: duplicatePlatform,
    })

    await first.restoreLastConversation()
    await duplicate.restoreLastConversation()

    expect(first.getSnapshot().restoreState).toBe('restored')
    expect(duplicate.getSnapshot()).toMatchObject({ messages: [], restoreState: undefined })
    expect(new LastConversationStore(duplicatePlatform).read('book-1', 'scope-1'))
      .toBeUndefined()
    expect(access.history).toHaveBeenCalledTimes(1)
    first.dispose()
    duplicate.dispose()
  })

  it.each([
    {
      name: 'a different stored book',
      storedBookId: 'book-2',
      storedScopeId: 'scope-1',
      descriptors: [] as readonly ConversationDescriptor[],
      expectedListCalls: 0,
      expectedHistoryCalls: 0,
    },
    {
      name: 'a different stored authorization',
      storedBookId: 'book-1',
      storedScopeId: 'scope-2',
      descriptors: [] as readonly ConversationDescriptor[],
      expectedListCalls: 0,
      expectedHistoryCalls: 0,
    },
    {
      name: 'an empty provider list',
      storedBookId: 'book-1',
      storedScopeId: 'scope-1',
      descriptors: [] as readonly ConversationDescriptor[],
      expectedListCalls: 1,
      expectedHistoryCalls: 0,
    },
    {
      name: 'an expired matching descriptor',
      storedBookId: 'book-1',
      storedScopeId: 'scope-1',
      descriptors: [historyDescriptor({ expiresAt: 1_000 })],
      expectedListCalls: 1,
      expectedHistoryCalls: 0,
    },
    {
      name: 'a pending descriptor',
      storedBookId: 'book-1',
      storedScopeId: 'scope-1',
      descriptors: [historyDescriptor({ canContinue: false, previousResponseId: undefined })],
      expectedListCalls: 1,
      expectedHistoryCalls: 0,
    },
    {
      name: 'a changed fetched head',
      storedBookId: 'book-1',
      storedScopeId: 'scope-1',
      descriptors: [historyDescriptor()],
      historyPreviousResponseId: 'resp-changed',
      expectedListCalls: 1,
      expectedHistoryCalls: 1,
    },
  ])('settles fresh without model work for $name', async (fixture) => {
    const storage = new MemoryStorage()
    const locks = new FixtureLocks()
    const platform = { storage, locks, now: () => 2_000 } satisfies LastConversationPlatform
    new LastConversationStore(platform).save(
      fixture.storedBookId,
      fixture.storedScopeId,
      'resp-saved',
    )
    const list = vi.fn(async (): Promise<readonly ConversationDescriptor[]> => fixture.descriptors)
    const history = vi.fn(async (): Promise<ExecutionHistory> => executionHistory({
      previousResponseId: fixture.historyPreviousResponseId ?? 'resp-saved',
    }))
    const access: TutorHistoryAccess = {
      scopeId: 'scope-1',
      generation: 'generation-1',
      list,
      history,
    }
    const fetch = vi.fn(async () => eventStream(textEvents('unused', 'unused')))
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source')],
      connection: new FixtureConnection(fixtureModel(fetch), access),
      restorePlatform: platform,
    })
    conversation.setDraft('Still a fresh draft')

    await conversation.restoreLastConversation()

    expect(conversation.getSnapshot()).toMatchObject({
      draft: 'Still a fresh draft',
      messages: [],
      restoreState: undefined,
    })
    expect(fetch).not.toHaveBeenCalled()
    expect(list).toHaveBeenCalledTimes(fixture.expectedListCalls)
    expect(history).toHaveBeenCalledTimes(fixture.expectedHistoryCalls)
    expect(new LastConversationStore(platform).read('book-1', 'scope-1')).toBeUndefined()
    conversation.dispose()
    await locks.settled()
  })

  it('rejects a late history result after book disposal', async () => {
    const storage = new MemoryStorage()
    const locks = new FixtureLocks()
    const platform = { storage, locks, now: () => 2_000 } satisfies LastConversationPlatform
    new LastConversationStore(platform).save('book-1', 'scope-1', 'resp-saved')
    let finishHistory!: (history: ExecutionHistory) => void
    const pendingHistory = new Promise<ExecutionHistory>((resolve) => { finishHistory = resolve })
    let observedSignal: AbortSignal | undefined
    const access: TutorHistoryAccess = {
      scopeId: 'scope-1',
      generation: 'generation-1',
      list: async () => [historyDescriptor()],
      history: vi.fn(async (_conversationId, signal) => {
        observedSignal = signal
        return pendingHistory
      }),
    }
    const fetch = vi.fn(async () => eventStream(textEvents('unused', 'unused')))
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source')],
      connection: new FixtureConnection(fixtureModel(fetch), access),
      restorePlatform: platform,
    })
    const restoring = conversation.restoreLastConversation()
    await vi.waitFor(() => expect(access.history).toHaveBeenCalledTimes(1))

    conversation.dispose()
    expect(observedSignal?.aborted).toBe(true)
    finishHistory(executionHistory())
    await restoring

    expect(conversation.getSnapshot().messages).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
    await locks.settled()
  })

  it('executes two sequential tools, continues only with outputs, and follows up without replay', async () => {
    const bodies: JsonObject[] = []
    const model = fixtureModel(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as JsonObject)
      const response = [
        toolCallEvents('resp-first', 'call-first', 'first_action'),
        toolCallEvents('resp-second', 'call-second', 'second_action'),
        textEvents('resp-answer', 'Both actions completed.'),
        textEvents('resp-followup', 'The prior result remains in context.'),
      ][bodies.length - 1]
      if (!response) throw new Error('Unexpected fixture request')
      return eventStream(response)
    })
    const executed: string[] = []
    const tools = [
      tool('first_action', async () => {
        executed.push('first_action')
        return textResult('first-result')
      }),
      tool('second_action', async () => {
        executed.push('second_action')
        return textResult('second-result')
      }),
    ]
    const connection = new FixtureConnection(model)
    const conversation = new TutorConversation({ bookId: 'book-1', tools, connection })
    conversation.attach({ bookId: 'book-1', selection })
    conversation.setDraft('Explain this and use both actions.')

    await conversation.send()

    expect(executed).toEqual(['first_action', 'second_action'])
    expect(bodies).toHaveLength(3)
    expect(bodies[0]).not.toHaveProperty('previous_response_id')
    expect(bodies[0]?.input).toEqual([expect.objectContaining({ role: 'user' })])
    expect(JSON.stringify(bodies[0]?.input)).toContain(selection.quote)
    expect(bodies.slice(1, 3).map((body) => body.previous_response_id)).toEqual([
      'resp-first',
      'resp-second',
    ])
    expect(bodies[1]?.input).toEqual([
      expect.objectContaining({ type: 'function_call_output', call_id: 'call-first' }),
    ])
    expect(bodies[2]?.input).toEqual([
      expect.objectContaining({ type: 'function_call_output', call_id: 'call-second' }),
    ])
    expect(bodies.every((body) => (body.tools as unknown[]).length === 2)).toBe(true)
    expect(connection.catalogs).toHaveLength(1)
    expect(connection.catalogs[0]?.map(({ name }) => name)).toEqual([
      'first_action',
      'second_action',
    ])
    expect(conversation.getSnapshot()).toMatchObject({
      status: 'idle',
      draft: '',
      attachment: undefined,
      messages: [
        { role: 'user', text: 'Explain this and use both actions.', status: 'complete' },
        { role: 'assistant', text: 'Both actions completed.', status: 'complete' },
      ],
    })

    conversation.setDraft('Why does that follow?')
    await conversation.send()

    expect(bodies).toHaveLength(4)
    expect(bodies[3]?.previous_response_id).toBe('resp-answer')
    expect(bodies[3]?.input).toEqual([expect.objectContaining({ role: 'user' })])
    expect(JSON.stringify(bodies[3]?.input)).toContain('Why does that follow?')
    expect(JSON.stringify(bodies[3]?.input)).not.toContain('Explain this and use both actions.')
    expect(connection.catalogs).toHaveLength(2)
    conversation.dispose()
  })

  it('does not dispatch empty or overlapping sends and preserves clean display text', async () => {
    let release!: () => void
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    const bodies: JsonObject[] = []
    const model = fixtureModel(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as JsonObject)
      await waiting
      return eventStream(textEvents('resp-one', 'Answer.'))
    })
    const connection = new FixtureConnection(model)
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source')],
      connection,
    })

    await conversation.send()
    conversation.attach({ bookId: 'book-1', selection })
    conversation.setDraft('  Show me why.  ')
    const sending = conversation.send()
    await vi.waitFor(() => expect(bodies).toHaveLength(1))
    await conversation.send()

    expect(conversation.getSnapshot().messages[0]).toMatchObject({
      role: 'user',
      text: 'Show me why.',
    })
    expect(JSON.stringify(bodies[0]?.input)).toContain(selection.quote)
    expect(bodies).toHaveLength(1)
    release()
    await sending
    conversation.dispose()
  })

  it('does not dispatch when a stale saved association cannot be cleared', async () => {
    const fetch = vi.fn(async () => eventStream(textEvents('unused', 'unused')))
    const storage = new MemoryStorage()
    const platform = {
      storage,
      locks: new FixtureLocks(),
      now: () => 2_000,
    } satisfies LastConversationPlatform
    new LastConversationStore(platform).save('book-1', 'old-scope', 'resp-old')
    storage.denyRemovals = true
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source')],
      connection: new FixtureConnection(fixtureModel(fetch)),
      restorePlatform: platform,
    })
    conversation.setDraft('Do not risk restoring the old head')

    await conversation.send()

    expect(fetch).not.toHaveBeenCalled()
    expect(conversation.getSnapshot()).toMatchObject({
      status: 'idle',
      draft: 'Do not risk restoring the old head',
      messages: [],
      error: expect.any(String),
    })
    conversation.dispose()
  })

  it('preserves draft and attachment when execution fails before dispatch', async () => {
    const fetch = vi.fn(async () => eventStream(textEvents('unused', 'unused')))
    const connection = new FixtureConnection(fixtureModel(fetch))
    connection.setSnapshot({ phase: 'disconnected' })
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source')],
      connection,
    })
    conversation.attach({ bookId: 'book-1', selection })
    conversation.setDraft('Keep this question')

    await conversation.send()

    expect(fetch).not.toHaveBeenCalled()
    expect(conversation.getSnapshot()).toMatchObject({
      status: 'idle',
      draft: 'Keep this question',
      attachment: { selection },
      messages: [],
      error: 'The tutor response failed. Start a new conversation before trying again.',
    })
    conversation.dispose()
  })

  it('captures attachments by value and never accepts another book', () => {
    const connection = new FixtureConnection(
      fixtureModel(async () => eventStream(textEvents('unused', 'unused'))),
    )
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source')],
      connection,
    })
    const mutable = structuredClone(selection)
    conversation.attach({ bookId: 'book-1', selection: mutable })
    mutable.quote = 'mutated after attachment'
    conversation.attach({ bookId: 'book-2', selection: mutable })

    expect(conversation.getSnapshot().attachment?.selection.quote).toBe(selection.quote)
    conversation.dispose()
  })

  it('surfaces an actual provider error once and blocks automatic replay', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: 'admission outcome unknown',
              type: 'server_error',
              param: 'response',
              code: 'gateway_failure',
            },
          }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        ),
    )
    const connection = new FixtureConnection(fixtureModel(fetch))
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source')],
      connection,
    })
    conversation.setDraft('Possibly admitted')

    await conversation.send()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(conversation.getSnapshot()).toMatchObject({
      status: 'interrupted',
      messages: [
        { role: 'user', text: 'Possibly admitted', status: 'complete' },
        { role: 'assistant', status: 'interrupted' },
      ],
      error: 'The AI provider could not complete this response. Start a new conversation before trying again.',
      diagnostic: {
        name: 'APICallError',
        category: 'provider',
        code: 'provider_request_failed',
        status: 500,
      },
    })
    conversation.setDraft('Never replay')
    await conversation.send()
    expect(fetch).toHaveBeenCalledTimes(1)
    conversation.dispose()
  })

  it('keeps the same conversation through a same-generation refresh', async () => {
    const bodies: JsonObject[] = []
    const connection = new FixtureConnection(
      fixtureModel(async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as JsonObject)
        return eventStream(textEvents(`resp-${bodies.length}`, `answer-${bodies.length}`))
      }),
    )
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source')],
      connection,
    })
    conversation.setDraft('First')
    await conversation.send()

    connection.setSnapshot({ phase: 'connecting', generation: 'generation-1' })
    expect(conversation.getSnapshot().status).toBe('idle')
    connection.setSnapshot({ phase: 'connected', generation: 'generation-1' })
    conversation.setDraft('Second')
    await conversation.send()

    expect(bodies[1]?.previous_response_id).toBe('resp-1')
    expect(conversation.getSnapshot().status).toBe('idle')
    conversation.dispose()
  })

  it('interrupts on Stop and never reuses the dirty checkpoint without newConversation', async () => {
    const bodies: JsonObject[] = []
    let streamController!: ReadableStreamDefaultController<Uint8Array>
    const encoder = new TextEncoder()
    const connection = new FixtureConnection(
      fixtureModel(async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as JsonObject)
        if (bodies.length > 1) return eventStream(textEvents('resp-clean', 'Fresh answer.'))
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              streamController = controller
              for (const event of partialTextEvents('resp-dirty', 'Visible partial')) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
              }
              init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), {
                once: true,
              })
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        )
      }),
    )
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source')],
      connection,
    })
    conversation.setDraft('Start')
    const pending = conversation.send()
    await vi.waitFor(() =>
      expect(conversation.getSnapshot().messages.at(-1)?.text).toBe('Visible partial'),
    )

    conversation.stop()
    await pending
    expect(conversation.getSnapshot()).toMatchObject({
      status: 'interrupted',
      messages: [
        { role: 'user', status: 'complete' },
        { role: 'assistant', text: 'Visible partial', status: 'interrupted' },
      ],
    })
    conversation.setDraft('Do not replay')
    await conversation.send()
    expect(bodies).toHaveLength(1)

    conversation.newConversation()
    await conversation.send()
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).not.toHaveProperty('previous_response_id')
    // Referencing the controller keeps this fixture honest: Stop ended it.
    expect(() => streamController.close()).toThrow()
    conversation.dispose()
  })

  it('marks response.created plus a partial delta and EOF as interrupted with no checkpoint reuse', async () => {
    const bodies: JsonObject[] = []
    const connection = new FixtureConnection(
      fixtureModel(async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as JsonObject)
        return bodies.length === 1
          ? eventStream(partialTextEvents('resp-eof', 'Partial before EOF'))
          : eventStream(textEvents('resp-after-reset', 'Fresh answer.'))
      }),
    )
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source')],
      connection,
    })
    conversation.setDraft('First attempt')

    await conversation.send()

    expect(conversation.getSnapshot()).toMatchObject({
      status: 'interrupted',
      messages: [
        { role: 'user', status: 'complete' },
        { role: 'assistant', text: 'Partial before EOF', status: 'interrupted' },
      ],
    })
    conversation.setDraft('Unsafe follow-up')
    await conversation.send()
    expect(bodies).toHaveLength(1)
    conversation.newConversation()
    await conversation.send()
    expect(bodies[1]).not.toHaveProperty('previous_response_id')
    conversation.dispose()
  })

  it('interrupts at the explicit twelve-step tool bound without a thirteenth request', async () => {
    const bodies: JsonObject[] = []
    const execute = vi.fn(async () => textResult('again'))
    const connection = new FixtureConnection(
      fixtureModel(async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as JsonObject)
        const step = bodies.length
        return eventStream(toolCallEvents(`resp-loop-${step}`, `call-loop-${step}`, 'loop'))
      }),
    )
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('loop', execute)],
      connection,
    })
    conversation.setDraft('Loop forever')

    await conversation.send()

    expect(bodies).toHaveLength(12)
    expect(execute).toHaveBeenCalledTimes(12)
    expect(conversation.getSnapshot()).toMatchObject({
      status: 'interrupted',
      error: expect.stringContaining('12-step tool limit'),
    })
    conversation.dispose()
  })

  it('rejects stale events when the provider generation is replaced', async () => {
    const bodies: JsonObject[] = []
    let finishOld!: () => void
    const oldTurn = new Promise<void>((resolve) => {
      finishOld = resolve
    })
    const connection = new FixtureConnection(
      fixtureModel(async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as JsonObject)
        if (bodies.length === 1) {
          await oldTurn
          return eventStream(textEvents('resp-old', 'Stale text must not appear.'))
        }
        return eventStream(textEvents('resp-new', 'New connection answer.'))
      }),
    )
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source')],
      connection,
    })
    conversation.setDraft('Old request')
    const pending = conversation.send()
    await vi.waitFor(() => expect(bodies).toHaveLength(1))

    connection.setSnapshot({ phase: 'connected', generation: 'generation-2' })
    finishOld()
    await pending

    expect(conversation.getSnapshot().status).toBe('interrupted')
    expect(JSON.stringify(conversation.getSnapshot().messages)).not.toContain('Stale text')
    conversation.setDraft('New request')
    await conversation.send()
    expect(bodies).toHaveLength(1)
    conversation.newConversation()
    await conversation.send()
    expect(bodies[1]).not.toHaveProperty('previous_response_id')
    expect(conversation.getSnapshot().messages.at(-1)?.text).toBe('New connection answer.')
    conversation.dispose()
  })

  it('shows returned tool isError as an error and sends error-json to the model', async () => {
    const bodies: JsonObject[] = []
    let releaseFinal!: () => void
    const finalBarrier = new Promise<void>((resolve) => {
      releaseFinal = resolve
    })
    const connection = new FixtureConnection(
      fixtureModel(async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as JsonObject)
        if (bodies.length === 1) {
          return eventStream(toolCallEvents('resp-tool-error', 'call-error', 'read_source'))
        }
        await finalBarrier
        return eventStream(textEvents('resp-tool-answer', 'The source lookup failed.'))
      }),
    )
    const sourceError = errorResult('Source unavailable')
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source', async () => sourceError)],
      connection,
    })
    const observed: TutorConversationSnapshot[] = []
    conversation.subscribe(() => observed.push(conversation.getSnapshot()))
    conversation.setDraft('Read the source')
    const pending = conversation.send()
    await vi.waitFor(() => expect(bodies).toHaveLength(2))

    expect(observed.some((snapshot) => snapshot.messages.at(-1)?.activity === 'read_source reported an error.')).toBe(true)
    expect(observed.some((snapshot) => snapshot.messages.at(-1)?.activity === 'read_source complete.')).toBe(false)
    expect(bodies[1]?.input).toEqual([
      expect.objectContaining({
        type: 'function_call_output',
        call_id: 'call-error',
        output: expect.stringContaining('"isError":true'),
      }),
    ])
    releaseFinal()
    await pending
    expect(conversation.getSnapshot().messages.at(-1)?.text).toBe('The source lookup failed.')
    conversation.dispose()
  })

  it('retains the original body-read failure privately and exposes only safe diagnostics after a tool call', async () => {
    const secretMessage = 'SECRET_BODY_READ_MESSAGE'
    const secretHeader = 'SECRET_RESPONSE_HEADER'
    const secretToolPayload = 'SECRET_TOOL_PAYLOAD'
    const bodyReadFailure = new TypeError(secretMessage)
    const bodies: JsonObject[] = []
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as JsonObject)
      if (bodies.length === 1) {
        return eventStream(toolCallEvents('resp-tool', 'call-tool', 'read_source'))
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) { controller.error(bodyReadFailure) },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'text/event-stream',
            'x-private-diagnostic': secretHeader,
          },
        },
      )
    })
    const execute = vi.fn(async () => errorResult(secretToolPayload))
    const connection = new FixtureConnection(fixtureModel(fetch))
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source', execute)],
      connection,
    })
    conversation.setDraft('Read the source safely')

    await conversation.send()

    const original = conversation.getFailureCause()
    expect(original).not.toBe(bodyReadFailure)
    expect(causeChain(original)).toContain(bodyReadFailure)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(conversation.getSnapshot()).toMatchObject({
      status: 'interrupted',
      error: 'The AI provider returned a response Bookhand could not read. Start a new conversation before trying again.',
      diagnostic: {
        name: 'APICallError',
        category: 'response-processing',
        code: 'response_processing_failed',
        status: 200,
        cause: {
          name: 'TypeError',
          category: 'response-processing',
          code: 'response_processing_failed',
        },
      },
      partialEffectsWarning: expect.stringContaining('did not roll back'),
    })
    const safeUiState = JSON.stringify({
      snapshot: conversation.getSnapshot(),
      renderedDiagnostic: formatTutorFailureDiagnostic(conversation.getSnapshot().diagnostic!),
    })
    expect(safeUiState).not.toContain(secretMessage)
    expect(safeUiState).not.toContain(secretHeader)
    expect(safeUiState).not.toContain(secretToolPayload)

    conversation.setDraft('Never replay this')
    await conversation.send()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenCalledTimes(1)

    conversation.newConversation()
    expect(conversation.getFailureCause()).toBeUndefined()
    expect(conversation.getSnapshot().diagnostic).toBeUndefined()
    expect(conversation.getSnapshot().partialEffectsWarning).toBeUndefined()
    conversation.dispose()
  })

  it('bounds and allowlists unknown, deep, and cyclic diagnostic causes', () => {
    const secret = 'SECRET_CUSTOM_ERROR'
    const cycle: { name: string; message: string; cause?: unknown } = {
      name: 'PrivateVendorFailure',
      message: secret,
    }
    cycle.cause = cycle
    const cyclic = diagnoseTutorFailure(cycle)
    expect(cyclic).toMatchObject({
      name: 'UnknownError',
      category: 'unknown',
      code: 'unknown_error',
      cause: { name: 'UnknownError', code: 'cause_cycle' },
    })
    expect(JSON.stringify(cyclic)).not.toContain(secret)

    const deep = diagnoseTutorFailure(new Error('one', {
      cause: new TypeError('two', {
        cause: new Error('three', { cause: new Error('four') }),
      }),
    }))
    expect(deep.cause?.cause?.causeOmitted).toBe(true)
    expect(JSON.stringify(deep)).not.toMatch(/one|two|three|four/)
  })

  it('retires book tools before accepting a pending late result', async () => {
    let finishTool!: () => void
    const toolBarrier = new Promise<void>((resolve) => {
      finishTool = resolve
    })
    let observedSignal: AbortSignal | undefined
    const execute = vi.fn(async (_input, options?: { signal?: AbortSignal }) => {
      observedSignal = options?.signal
      await toolBarrier
      return textResult('late result')
    })
    const bodies: JsonObject[] = []
    const connection = new FixtureConnection(
      fixtureModel(async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as JsonObject)
        return eventStream(toolCallEvents('resp-tool', 'call-late', 'read_source'))
      }),
    )
    const conversation = new TutorConversation({
      bookId: 'book-1',
      tools: [tool('read_source', execute)],
      connection,
    })
    conversation.setDraft('Read')
    const pending = conversation.send()
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))

    conversation.dispose()
    expect(observedSignal?.aborted).toBe(true)
    finishTool()
    await pending

    expect(bodies).toHaveLength(1)
    expect(conversation.getSnapshot().status).toBe('interrupted')
  })
})

describe('Bookhand tool lending', () => {
  it('uses schema-checked handlers and preserves source errors/results', async () => {
    const execute = vi.fn(async () => textResult('Saved', { item: { id: 'lesson-test' } }))
    const source = tool('save', execute, {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    })
    const lifetime = new AbortController()
    const [lent] = lendBookhandTools([source], lifetime.signal)
    const context = {
      connectionId: 'generation-1',
      toolName: 'save',
      meta: null,
      actionId: undefined,
    }

    const invalid = await lent!.execute({}, context)
    expect(invalid).toMatchObject({ isError: true })
    expect(execute).not.toHaveBeenCalled()
    await expect(lent!.execute({ text: 'yes' }, context)).resolves.toEqual(
      textResult('Saved', { item: { id: 'lesson-test' } }),
    )
    lifetime.abort()
    await expect(lent!.execute({ text: 'late' }, context)).rejects.toThrow()
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('combines turn and book cancellation and suppresses a pending late result', async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const lifetime = new AbortController()
    const turn = new AbortController()
    const execute = vi.fn(async (_input, options?: { signal?: AbortSignal }) => {
      await pending
      expect(options?.signal?.aborted).toBe(true)
      return textResult('late')
    })
    const [lent] = lendBookhandTools([tool('read_source', execute)], lifetime.signal)
    const result = lent!.execute(
      {},
      {
        signal: turn.signal,
        connectionId: 'generation-1',
        toolName: 'read_source',
        meta: null,
        actionId: 'call-1',
      },
    )
    turn.abort()
    finish()

    await expect(result).rejects.toThrow()
    expect(lifetime.signal.aborted).toBe(false)
  })
})

function fixtureModel(fetch: typeof globalThis.fetch): LanguageModel {
  return createAiSdkOpenResponsesModel({
    endpoint: 'https://gateway.test/v1/responses',
    model: 'selected-model',
    getAccessToken: () => 'fixture-token',
    fetch,
  })
}

function historyDescriptor(
  overrides: Partial<ConversationDescriptor> = {},
): ConversationDescriptor {
  const descriptor = {
    conversationId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    expiresAt: 10_000,
    canContinue: true,
    previousResponseId: 'resp-saved',
    ...overrides,
  }
  if (!descriptor.canContinue) {
    return Object.freeze({
      conversationId: descriptor.conversationId,
      expiresAt: descriptor.expiresAt,
      canContinue: false,
    })
  }
  return Object.freeze(descriptor)
}

function executionHistory(
  overrides: Partial<ExecutionHistory> = {},
): ExecutionHistory {
  return Object.freeze({
    ...historyDescriptor(),
    projection: 'execution-history',
    entries: Object.freeze([
      { kind: 'input' as const, text: 'Restored input' },
      { kind: 'assistant' as const, text: 'Restored answer' },
    ]),
    truncated: false,
    ...overrides,
  })
}

class MemoryStorage implements Storage {
  readonly #items = new Map<string, string>()
  denyRemovals = false

  get length(): number { return this.#items.size }
  clear(): void { this.#items.clear() }
  getItem(key: string): string | null { return this.#items.get(key) ?? null }
  key(index: number): string | null { return [...this.#items.keys()][index] ?? null }
  removeItem(key: string): void {
    if (this.denyRemovals) throw new Error('storage removal denied')
    this.#items.delete(key)
  }
  setItem(key: string, value: string): void { this.#items.set(key, value) }
}

class FixtureLocks implements TutorConversationLock {
  readonly #held = new Set<string>()
  readonly #requests = new Set<Promise<unknown>>()

  request = <T,>(
    name: string,
    _options: { readonly mode: 'exclusive'; readonly ifAvailable: true },
    callback: (lock: unknown | null) => T | Promise<T>,
  ): Promise<T> => {
    if (this.#held.has(name)) return Promise.resolve(callback(null))
    this.#held.add(name)
    const request = Promise.resolve(callback({ name })).finally(() => {
      this.#held.delete(name)
      this.#requests.delete(request)
    })
    this.#requests.add(request)
    return request
  }

  async settled(): Promise<void> {
    await Promise.all([...this.#requests])
  }
}

class DelayedFirstLock implements TutorConversationLock {
  requests = 0
  #admit: (() => void) | undefined

  request = async <T,>(
    name: string,
    _options: { readonly mode: 'exclusive'; readonly ifAvailable: true },
    callback: (lock: unknown | null) => T | Promise<T>,
  ): Promise<T> => {
    this.requests += 1
    if (this.requests === 1) {
      await new Promise<void>((resolve) => { this.#admit = resolve })
    }
    return callback({ name })
  }

  admitFirst(): void {
    this.#admit?.()
  }
}

function tool(
  name: string,
  execute: ToolDefinition['execute'] = async () => textResult(`${name}-result`),
  inputSchema: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
  },
): ToolDefinition {
  return withOutputSchema({
    name,
    description: `Execute ${name}`,
    inputSchema,
    execute,
  })
}

function eventStream(events: readonly unknown[]): Response {
  return new Response(
    `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`,
    { headers: { 'content-type': 'text/event-stream' } },
  )
}

function toolCallEvents(responseId: string, callId: string, name: string) {
  const response = responseShape(responseId, [])
  const item = {
    id: `item-${callId}`,
    type: 'function_call',
    status: 'completed',
    call_id: callId,
    name,
    arguments: '{}',
  }
  return [
    { type: 'response.created', sequence_number: 0, response },
    {
      type: 'response.output_item.added',
      sequence_number: 1,
      output_index: 0,
      item,
    },
    {
      type: 'response.output_item.done',
      sequence_number: 2,
      output_index: 0,
      item,
    },
    {
      type: 'response.completed',
      sequence_number: 3,
      response: { ...response, output: [item] },
    },
  ]
}

function textEvents(responseId: string, text: string) {
  const item = textItem(responseId, text)
  const response = responseShape(responseId, [item])
  return [
    { type: 'response.created', sequence_number: 0, response },
    {
      type: 'response.output_item.added',
      sequence_number: 1,
      output_index: 0,
      item,
    },
    {
      type: 'response.output_text.delta',
      sequence_number: 2,
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      delta: text,
    },
    {
      type: 'response.output_item.done',
      sequence_number: 3,
      output_index: 0,
      item,
    },
    { type: 'response.completed', sequence_number: 4, response },
  ]
}

function partialTextEvents(responseId: string, text: string) {
  const item = textItem(responseId, text)
  return [
    {
      type: 'response.created',
      sequence_number: 0,
      response: { ...responseShape(responseId, []), status: 'in_progress' },
    },
    {
      type: 'response.output_item.added',
      sequence_number: 1,
      output_index: 0,
      item: { ...item, status: 'in_progress', content: [] },
    },
    {
      type: 'response.output_text.delta',
      sequence_number: 2,
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      delta: text,
    },
  ]
}

function textItem(responseId: string, text: string) {
  return {
    id: `message-${responseId}`,
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text, annotations: [] }],
  }
}

function responseShape(responseId: string, output: readonly unknown[]) {
  return {
    id: responseId,
    object: 'response',
    created_at: 1,
    status: 'completed',
    model: 'selected-model',
    output,
  }
}

function causeChain(value: unknown): unknown[] {
  const causes: unknown[] = []
  const seen = new Set<unknown>()
  let current = value
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    causes.push(current)
    current = (current as { cause?: unknown }).cause
  }
  return causes
}
