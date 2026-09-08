export interface ConversationDescriptor {
  readonly conversationId: string
  readonly expiresAt: number
  readonly canContinue: boolean
  readonly previousResponseId?: string
}

export interface ExecutionHistory extends ConversationDescriptor {
  readonly projection: 'execution-history'
  readonly entries: readonly {
    readonly kind: 'input' | 'assistant'
    readonly text: string
  }[]
  readonly truncated: boolean
}

export interface TutorHistoryAccess {
  readonly scopeId: string
  readonly generation: string
  list(signal: AbortSignal): Promise<readonly ConversationDescriptor[]>
  history(conversationId: string, signal: AbortSignal): Promise<ExecutionHistory>
}

export class ConversationHistoryUnavailableError extends Error {
  constructor() {
    super('This conversation is no longer available')
    this.name = 'ConversationHistoryUnavailableError'
  }
}

const MAX_CONVERSATIONS = 8
const MAX_ENTRIES = 200
const MAX_ENTRY_TEXT = 16_384
const MAX_TOTAL_TEXT = 131_072
const CONVERSATION_ID = /^[a-f0-9]{36}$/
const RESPONSE_ID = /^[A-Za-z0-9_.:-]{1,256}$/

export function parseConversationDescriptors(value: unknown): readonly ConversationDescriptor[] {
  const root = record(value)
  if (!root || !Array.isArray(root.conversations) || root.conversations.length > MAX_CONVERSATIONS) {
    throw invalidHistoryResponse()
  }
  return Object.freeze(root.conversations.map(parseDescriptor))
}

export function parseExecutionHistory(value: unknown): ExecutionHistory {
  const root = record(value)
  if (!root || root.projection !== 'execution-history' || !Array.isArray(root.entries)
    || root.entries.length > MAX_ENTRIES || typeof root.truncated !== 'boolean') {
    throw invalidHistoryResponse()
  }
  const descriptor = parseDescriptor(root)
  let total = 0
  const entries = root.entries.map((value) => {
    const entry = record(value)
    if (!entry || (entry.kind !== 'input' && entry.kind !== 'assistant')
      || typeof entry.text !== 'string' || entry.text.length === 0
      || entry.text.length > MAX_ENTRY_TEXT) {
      throw invalidHistoryResponse()
    }
    total += entry.text.length
    if (total > MAX_TOTAL_TEXT) throw invalidHistoryResponse()
    return Object.freeze({ kind: entry.kind, text: entry.text })
  })
  return Object.freeze({
    ...descriptor,
    projection: 'execution-history',
    entries: Object.freeze(entries),
    truncated: root.truncated,
  })
}

export function isUnavailableHistoryResponse(status: number, value: unknown): boolean {
  const root = record(value)
  const error = record(root?.error)
  if (error?.type !== 'invalid_request_error' || typeof error.message !== 'string') return false
  return (status === 404 && error.code === 'conversation_unavailable')
    || (status === 409 && error.code === 'conversation_changed')
}

function parseDescriptor(value: unknown): ConversationDescriptor {
  const descriptor = record(value)
  if (!descriptor || typeof descriptor.conversationId !== 'string'
    || !CONVERSATION_ID.test(descriptor.conversationId)
    || typeof descriptor.expiresAt !== 'number'
    || !Number.isSafeInteger(descriptor.expiresAt) || descriptor.expiresAt < 0
    || typeof descriptor.canContinue !== 'boolean') {
    throw invalidHistoryResponse()
  }
  const previousResponseId = descriptor.previousResponseId
  if (descriptor.canContinue) {
    if (typeof previousResponseId !== 'string' || !RESPONSE_ID.test(previousResponseId)) {
      throw invalidHistoryResponse()
    }
  } else if (previousResponseId !== undefined) {
    throw invalidHistoryResponse()
  }
  return Object.freeze({
    conversationId: descriptor.conversationId,
    expiresAt: descriptor.expiresAt,
    canContinue: descriptor.canContinue,
    ...(previousResponseId === undefined ? {} : { previousResponseId }),
  })
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function invalidHistoryResponse(): Error {
  return new Error('OpenClaw returned an invalid conversation history response')
}
