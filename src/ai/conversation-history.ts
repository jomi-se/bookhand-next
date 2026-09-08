import {
  OpenClawConversationUnavailableError,
  type OpenClawConversationDescriptor,
  type OpenClawExecutionHistory,
} from '@open-agent-connect/web'

export type ConversationDescriptor = OpenClawConversationDescriptor
export type ExecutionHistory = OpenClawExecutionHistory

export interface TutorHistoryAccess {
  readonly scopeId: string
  readonly generation: string
  list(signal: AbortSignal): Promise<readonly ConversationDescriptor[]>
  history(conversationId: string, signal: AbortSignal): Promise<ExecutionHistory>
}

export { OpenClawConversationUnavailableError as ConversationHistoryUnavailableError }
