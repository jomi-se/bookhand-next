export type TutorFailureCategory =
  | 'response-processing'
  | 'provider'
  | 'tool'
  | 'interruption'
  | 'unknown'

export interface TutorFailureDiagnostic {
  readonly name: 'APICallError' | 'JSONParseError' | 'TypeError' | 'AbortError' | 'Error' | 'UnknownError'
  readonly category: TutorFailureCategory
  readonly code:
    | 'response_processing_failed'
    | 'provider_request_failed'
    | 'tool_failed'
    | 'interrupted'
    | 'operation_failed'
    | 'unknown_error'
    | 'cause_cycle'
  readonly message: string
  readonly status?: number
  readonly cause?: TutorFailureDiagnostic
  readonly causeOmitted?: true
}

export type TutorFailureContext = 'provider' | 'tool' | 'interruption' | 'setup'

const MAX_DEPTH = 3

/** Project an arbitrary SDK error to a small, non-sensitive diagnostic tree. */
export function diagnoseTutorFailure(
  failure: unknown,
  context: TutorFailureContext = 'provider',
): TutorFailureDiagnostic {
  return diagnose(failure, context, 0, new Set<object>())
}

export function tutorFailureMessage(diagnostic: TutorFailureDiagnostic): string {
  switch (diagnostic.category) {
    case 'response-processing':
      return 'The AI provider returned a response Bookhand could not read. Start a new conversation before trying again.'
    case 'provider':
      return 'The AI provider could not complete this response. Start a new conversation before trying again.'
    case 'tool':
      return 'A Bookhand tool failed during this response. Start a new conversation before trying again.'
    case 'interruption':
      return 'The tutor response was interrupted. Start a new conversation before trying again.'
    default:
      return 'The tutor response failed. Start a new conversation before trying again.'
  }
}

export function formatTutorFailureDiagnostic(diagnostic: TutorFailureDiagnostic): string {
  const nodes: string[] = []
  let current: TutorFailureDiagnostic | undefined = diagnostic
  while (current) {
    nodes.push([
      current.category,
      current.name,
      current.code,
      ...(current.status === undefined ? [] : [`HTTP ${current.status}`]),
    ].join(' · '))
    current = current.cause
  }
  return nodes.join(' → ')
}

function diagnose(
  failure: unknown,
  context: TutorFailureContext,
  depth: number,
  seen: Set<object>,
): TutorFailureDiagnostic {
  if (isObject(failure)) {
    if (seen.has(failure)) {
      return staticDiagnostic('UnknownError', 'unknown', 'cause_cycle', 'A repeated cause was omitted.')
    }
    seen.add(failure)
  }

  const rawName = readString(failure, 'name')
  const name = allowedName(rawName)
  const status = name === 'APICallError' ? readStatus(failure) : undefined
  const category = classify(name, status, context)
  const base = classification(name, category, status)
  const cause = readCause(failure)
  if (cause === undefined) return base
  if (depth + 1 >= MAX_DEPTH) return { ...base, causeOmitted: true }
  return { ...base, cause: diagnose(cause, category === 'response-processing' ? 'provider' : context, depth + 1, seen) }
}

function classification(
  name: TutorFailureDiagnostic['name'],
  category: TutorFailureCategory,
  status: number | undefined,
): TutorFailureDiagnostic {
  if (category === 'response-processing') {
    return staticDiagnostic(name, category, 'response_processing_failed', 'Provider response processing failed.', status)
  }
  if (category === 'provider') {
    return staticDiagnostic(name, category, 'provider_request_failed', 'The provider request failed.', status)
  }
  if (category === 'tool') return staticDiagnostic(name, category, 'tool_failed', 'A tool operation failed.')
  if (category === 'interruption') return staticDiagnostic(name, category, 'interrupted', 'The operation was interrupted.')
  if (name === 'UnknownError') return staticDiagnostic(name, category, 'unknown_error', 'An unknown error occurred.')
  return staticDiagnostic(name, category, 'operation_failed', 'An operation failed.')
}

function classify(
  name: TutorFailureDiagnostic['name'],
  status: number | undefined,
  context: TutorFailureContext,
): TutorFailureCategory {
  if (context === 'tool') return 'tool'
  if (context === 'interruption' || name === 'AbortError') return 'interruption'
  if (name === 'JSONParseError') return 'response-processing'
  if (name === 'APICallError') {
    return status !== undefined && status >= 200 && status < 300
      ? 'response-processing'
      : 'provider'
  }
  return context === 'provider' && name === 'TypeError' ? 'response-processing' : 'unknown'
}

function allowedName(value: string | undefined): TutorFailureDiagnostic['name'] {
  if (value === 'AI_APICallError' || value === 'APICallError') return 'APICallError'
  if (value === 'AI_JSONParseError' || value === 'JSONParseError') return 'JSONParseError'
  if (value === 'TypeError') return 'TypeError'
  if (value === 'AbortError' || value === 'ResponseAborted' || value === 'TimeoutError') return 'AbortError'
  if (value === 'Error') return 'Error'
  return 'UnknownError'
}

function staticDiagnostic(
  name: TutorFailureDiagnostic['name'],
  category: TutorFailureCategory,
  code: TutorFailureDiagnostic['code'],
  message: string,
  status?: number,
): TutorFailureDiagnostic {
  return Object.freeze({ name, category, code, message, ...(status === undefined ? {} : { status }) })
}

function readStatus(value: unknown): number | undefined {
  const status = readProperty(value, 'statusCode') ?? readProperty(value, 'status')
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : undefined
}

function readCause(value: unknown): unknown {
  return readProperty(value, 'cause')
}

function readString(value: unknown, key: string): string | undefined {
  const property = readProperty(value, key)
  return typeof property === 'string' ? property : undefined
}

function readProperty(value: unknown, key: string): unknown {
  if (!isObject(value)) return undefined
  try { return (value as Record<string, unknown>)[key] } catch { return undefined }
}

function isObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}
