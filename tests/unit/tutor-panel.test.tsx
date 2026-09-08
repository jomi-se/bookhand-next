import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  AiConnectionSnapshot,
  AiConnectionStore,
  AuthorizeAiConnectionOptions,
} from '../../src/ai/connection.ts'
import type { AiFeatureIntent } from '../../src/ai/pending-intent.ts'
import type {
  ConversationDescriptor,
  ExecutionHistory,
  TutorHistoryAccess,
} from '../../src/ai/conversation-history.ts'
import { TUTOR_LAST_CONVERSATIONS_KEY } from '../../src/tutor/last-conversation.ts'
import { TutorPanel } from '../../src/tutor/TutorPanel.tsx'
import { textResult, withOutputSchema } from '../../src/webmcp/model-context.ts'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'locks')
  vi.restoreAllMocks()
})

const tools = [withOutputSchema({
  name: 'read',
  description: 'Read the book',
  inputSchema: { type: 'object' },
  execute: async () => textResult('book text'),
})]

class FakeConnection {
  snapshot: AiConnectionSnapshot
  historyDescriptors: readonly ConversationDescriptor[] = []
  historyResponse: ExecutionHistory | undefined
  readonly listeners = new Set<() => void>()
  readonly authorize = vi.fn(async (_options: AuthorizeAiConnectionOptions) => undefined)
  readonly finishAuthorization = vi.fn(async (): Promise<AiFeatureIntent | undefined> => undefined)
  readonly disconnect = vi.fn(async () => {
    this.setSnapshot({
      phase: 'disconnected',
      providerUrl: this.snapshot.providerUrl,
      experience: this.snapshot.experience,
    })
  })

  constructor(snapshot: AiConnectionSnapshot = {
    phase: 'disconnected',
    providerUrl: '',
    experience: 'tailscale',
  }) {
    this.snapshot = snapshot
  }

  readonly getSnapshot = () => this.snapshot
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setProviderUrl = (providerUrl: string) => this.setSnapshot({
    phase: 'disconnected',
    providerUrl,
    experience: this.snapshot.experience,
  })

  setExperience = (experience: 'tailscale' | 'https') => this.setSnapshot({
    phase: 'disconnected',
    providerUrl: this.snapshot.providerUrl,
    experience,
  })

  getExecution = () => ({ generation: this.snapshot.generation ?? 'generation-1', model: {} as never })
  readonly listHistory = vi.fn(async (_signal: AbortSignal) => this.historyDescriptors)
  readonly readHistory = vi.fn(async (_conversationId: string, _signal: AbortSignal) => {
    if (!this.historyResponse) throw new Error('No controlled history response')
    return this.historyResponse
  })
  readonly getHistoryAccess = vi.fn((): TutorHistoryAccess => ({
    scopeId: 'scope-1',
    generation: this.snapshot.generation ?? 'generation-1',
    list: this.listHistory,
    history: this.readHistory,
  }))
  dismissPendingAuthorization = vi.fn()

  setSnapshot(snapshot: AiConnectionSnapshot) {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}

function asStore(connection: FakeConnection): AiConnectionStore {
  return connection as unknown as AiConnectionStore
}

function props(connection = new FakeConnection()) {
  return {
    bookId: 'book-1',
    tools,
    connection: asStore(connection),
    open: true,
    onClose() {},
    onStudy() {},
  }
}

const restoredDescriptor: ConversationDescriptor = {
  conversationId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  expiresAt: 4_102_444_800_000,
  canContinue: true,
  previousResponseId: 'resp-restored-1',
}

function setRestoredHistory(connection: FakeConnection, truncated = false) {
  connection.historyDescriptors = [restoredDescriptor]
  connection.historyResponse = {
    ...restoredDescriptor,
    projection: 'execution-history',
    entries: [
      { kind: 'input', text: '<strong>Untrusted input</strong> \\(x\\)' },
      { kind: 'assistant', text: '<em>Restored answer</em> \\[y\\]' },
    ],
    truncated,
    reasoning: 'Hidden provider reasoning',
    toolCall: 'Hidden provider tool metadata',
  } as ExecutionHistory
}

function saveRestoredAssociation() {
  sessionStorage.setItem(TUTOR_LAST_CONVERSATIONS_KEY, JSON.stringify([{
    version: 1,
    bookId: 'book-1',
    scopeId: 'scope-1',
    previousResponseId: restoredDescriptor.previousResponseId,
  }]))
}

function installAvailableConversationLocks() {
  const locks = {
    request: vi.fn(async (
      _name: string,
      _options: { readonly mode: 'exclusive'; readonly ifAvailable: true },
      callback: (lock: unknown | null) => unknown | Promise<unknown>,
    ) => callback({})),
  }
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks })
  return locks
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('Tutor panel lifetime and connection UI', () => {
  it('stays mounted while book tools are preparing', () => {
    const connection = new FakeConnection()
    render(<TutorPanel {...props(connection)} tools={undefined} />)
    expect(screen.getByRole('complementary', { name: 'Tutor' })).toBeInTheDocument()
    expect(screen.getByText('Preparing this book’s tools…')).toBeInTheDocument()
  })

  it('preserves the draft across same-book tool refresh and panel close/reopen', async () => {
    const connection = new FakeConnection()
    const initial = props(connection)
    const { container, rerender } = render(<TutorPanel {...initial} />)
    const question = await screen.findByLabelText('Ask about your book')
    fireEvent.change(question, { target: { value: 'Keep this question' } })

    rerender(<TutorPanel {...initial} tools={undefined} open={false} />)
    expect(container.querySelector('#reader-tutor-panel')).not.toBeVisible()

    rerender(<TutorPanel {...initial} tools={tools.map((tool) => ({ ...tool }))} />)
    expect(screen.getByLabelText('Ask about your book')).toHaveValue('Keep this question')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('starts a fresh book conversation while preserving the shared connection', async () => {
    const connection = new FakeConnection({
      phase: 'connected',
      providerUrl: 'https://openclaw.example',
      experience: 'tailscale',
      generation: 'generation-1',
    })
    const initial = props(connection)
    const { rerender } = render(<TutorPanel {...initial} />)
    fireEvent.change(await screen.findByLabelText('Ask about your book'), {
      target: { value: 'Old book question' },
    })

    rerender(<TutorPanel {...initial} bookId="book-2" />)
    await waitFor(() => expect(screen.getByLabelText('Ask about your book')).toHaveValue(''))
    expect(screen.getByText('Connected on this browser')).toBeInTheDocument()
    expect(screen.getByText('Disconnect removes access. Bookhand keeps this address.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    await waitFor(() => expect(connection.disconnect).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('button', { name: 'Connect your AI' })).toBeInTheDocument()
    expect(screen.getByText(/Your provider owns Tutor history/)).toBeInTheDocument()
  })

  it('validates the address and authorizes with the captured draft and full tools', async () => {
    const connection = new FakeConnection()
    const beforeRedirect = vi.fn(async () => undefined)
    render(<TutorPanel {...props(connection)} beforeRedirect={beforeRedirect} />)
    const address = await screen.findByLabelText('AI address')

    fireEvent.change(address, { target: { value: 'http://not-secure.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect your AI' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('complete HTTPS address')
    expect(connection.authorize).not.toHaveBeenCalled()

    fireEvent.change(address, { target: { value: 'https://openclaw.example' } })
    fireEvent.change(screen.getByLabelText('Ask about your book'), {
      target: { value: 'Explain this chapter' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Connect your AI' }))
    await waitFor(() => expect(connection.authorize).toHaveBeenCalledTimes(1))
    expect(connection.authorize).toHaveBeenCalledWith(expect.objectContaining({
      tools: expect.arrayContaining([expect.objectContaining({ name: 'read' })]),
      intent: expect.objectContaining({
        feature: 'tutor',
        bookId: 'book-1',
        draft: 'Explain this chapter',
      }),
      beforeRedirect: expect.any(Function),
    }))
    await connection.authorize.mock.calls[0]![0].beforeRedirect()
    expect(beforeRedirect).toHaveBeenCalledTimes(1)
  })

  it('restores an owned callback draft and source once without sending it', async () => {
    const connection = new FakeConnection()
    const pending: AiFeatureIntent = {
      feature: 'tutor',
      bookId: 'book-1',
      draft: 'Keep this exact draft',
      attachment: {
        bookId: 'book-1',
        selection: {
          quote: 'A retained source passage',
          range: {
            sectionIndex: 1,
            startCfi: 'epubcfi(/6/2!/4/2:0)',
            endCfi: 'epubcfi(/6/2!/4/2:12)',
            textFingerprint: 'retained-source',
          },
        },
      },
    }
    connection.finishAuthorization.mockResolvedValue(pending)
    const finished = vi.fn()
    const initial = props(connection)
    const { rerender } = render(
      <TutorPanel {...initial} pendingIntent={pending} onAuthorizationFinished={finished} />,
    )

    await waitFor(() => expect(screen.getByLabelText('Ask about your book')).toHaveValue('Keep this exact draft'))
    expect(screen.getByText('A retained source passage')).toBeInTheDocument()
    expect(connection.finishAuthorization).toHaveBeenCalledTimes(1)
    expect(finished).toHaveBeenCalledTimes(1)

    rerender(<TutorPanel {...initial} pendingIntent={pending} onAuthorizationFinished={finished} />)
    await act(async () => undefined)
    expect(connection.finishAuthorization).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('renders the store error instead of claiming a connection succeeded', async () => {
    const connection = new FakeConnection({
      phase: 'error',
      providerUrl: 'https://openclaw.example',
      experience: 'tailscale',
      error: 'This authorization request expired; connect again.',
    })
    render(<TutorPanel {...props(connection)} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This authorization request expired; connect again.',
    )
    expect(screen.queryByText('Connected on this browser')).not.toBeInTheDocument()
  })

  it('restores only after the connected Tutor is open and the reader is ready', async () => {
    installAvailableConversationLocks()
    saveRestoredAssociation()
    const connection = new FakeConnection({
      phase: 'connected',
      providerUrl: 'https://openclaw.example',
      experience: 'tailscale',
      generation: 'generation-1',
    })
    setRestoredHistory(connection, true)
    const initial = props(connection)
    const { rerender } = render(<TutorPanel {...initial} open={false} />)

    await act(async () => undefined)
    expect(connection.listHistory).not.toHaveBeenCalled()

    rerender(<TutorPanel {...initial} readerReady={false} />)
    await act(async () => undefined)
    expect(connection.listHistory).not.toHaveBeenCalled()

    rerender(<TutorPanel {...initial} />)
    expect(await screen.findByText('Last conversation restored. Some history was omitted.')).toBeInTheDocument()
    expect(connection.listHistory).toHaveBeenCalledTimes(1)
    expect(connection.readHistory).toHaveBeenCalledWith(restoredDescriptor.conversationId, expect.any(AbortSignal))

    const inputHeading = screen.getByRole('heading', { name: 'Input (prompt or application output)' })
    const inputMessage = inputHeading.closest('section')
    expect(inputMessage).not.toBeNull()
    expect(within(inputMessage!).getByText('<strong>Untrusted input</strong> \\(x\\)')).toBeInTheDocument()
    expect(inputMessage!.querySelector('strong')).toBeNull()
    expect(inputMessage!.querySelector('.study-inline-math')).toBeNull()

    const answer = screen.getByText('<em>Restored answer</em> \\[y\\]')
    expect(answer.querySelector('em')).toBeNull()
    expect(answer.querySelector('.study-inline-math')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'You' })).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden provider reasoning')).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden provider tool metadata')).not.toBeInTheDocument()
  })

  it('starts restoration when an open ready Tutor becomes connected', async () => {
    installAvailableConversationLocks()
    const connection = new FakeConnection()
    render(<TutorPanel {...props(connection)} />)

    expect(connection.getHistoryAccess).not.toHaveBeenCalled()
    act(() => connection.setSnapshot({
      phase: 'connected',
      providerUrl: 'https://openclaw.example',
      experience: 'tailscale',
      generation: 'generation-2',
    }))

    await waitFor(() => expect(connection.getHistoryAccess).toHaveBeenCalledTimes(1))
  })

  it('blocks send while restoring and lets New conversation choose fresh state', async () => {
    installAvailableConversationLocks()
    saveRestoredAssociation()
    const connection = new FakeConnection({
      phase: 'connected',
      providerUrl: 'https://openclaw.example',
      experience: 'tailscale',
      generation: 'generation-1',
    })
    setRestoredHistory(connection)
    const list = deferred<readonly ConversationDescriptor[]>()
    connection.listHistory.mockImplementationOnce(async () => list.promise)
    render(<TutorPanel {...props(connection)} />)

    expect(await screen.findByText('Restoring last conversation…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry restore' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Ask about your book'), { target: { value: 'Keep this draft' } })
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()

    const fresh = screen.getByRole('button', { name: 'New conversation' })
    expect(fresh).toBeEnabled()
    fireEvent.click(fresh)
    expect(screen.queryByText('Restoring last conversation…')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Ask about your book')).toHaveValue('Keep this draft')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    expect(sessionStorage.getItem(TUTOR_LAST_CONVERSATIONS_KEY)).toBeNull()

    list.resolve([restoredDescriptor])
    await act(async () => undefined)
    expect(screen.queryByText('<strong>Untrusted input</strong> \\(x\\)')).not.toBeInTheDocument()
  })

  it('blocks send after a restore error and retries only on request', async () => {
    installAvailableConversationLocks()
    saveRestoredAssociation()
    const connection = new FakeConnection({
      phase: 'connected',
      providerUrl: 'https://openclaw.example',
      experience: 'tailscale',
      generation: 'generation-1',
    })
    setRestoredHistory(connection)
    connection.listHistory.mockRejectedValueOnce(new Error('History temporarily unavailable'))
    render(<TutorPanel {...props(connection)} />)

    fireEvent.change(await screen.findByLabelText('Ask about your book'), {
      target: { value: 'Preserve this draft' },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The last tutor conversation could not be restored. Retry or start a new conversation.',
    )
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(connection.listHistory).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Retry restore' }))
    expect(await screen.findByText('Last conversation restored.')).toBeInTheDocument()
    expect(connection.listHistory).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: 'Retry restore' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Ask about your book')).toHaveValue('Preserve this draft')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })
})
