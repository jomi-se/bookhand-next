import { parseOpenClawAuthorizationTransaction } from '@open-agent-connect/web'
import type { ReaderSelection } from '../domain/reader.ts'

export const AI_PENDING_AUTHORIZATION_KEY = 'bookhand.ai.authorization.pending.v1'

export interface AiFeatureIntent {
  readonly feature: 'tutor' | 'remaster'
  readonly bookId: string
  readonly draft: string
  readonly attachment?: {
    readonly bookId: string
    readonly selection: ReaderSelection
  }
}

export interface PendingAiAuthorization {
  readonly version: 1
  readonly transaction: string
  readonly expiresAt: string
  /** Non-secret local epoch used to reject superseded cross-tab callbacks. */
  readonly connectionEpoch: string
  readonly intent: AiFeatureIntent
}

export type PendingAiReturnStatus =
  | { readonly kind: 'owned'; readonly intent: AiFeatureIntent }
  | { readonly kind: 'invalid'; readonly intent?: AiFeatureIntent; readonly message: string }

const OAUTH_CALLBACK_KEYS = new Set([
  'state',
  'code',
  'error',
  'error_description',
  'iss',
])

/**
 * Read the data-only return intent only when the current URL is strictly owned
 * by Bookhand's saved OpenClaw transaction. This performs no discovery or other
 * network work and deliberately leaves cleanup to AiConnectionStore.
 */
export function readPendingAiIntent(callbackUrl?: string): AiFeatureIntent | undefined {
  const pending = readPendingAiAuthorization()
  if (!pending) return undefined

  try {
    const transaction = parseOpenClawAuthorizationTransaction(pending.transaction)
    const callback = new URL(callbackUrl ?? globalThis.location.href)
    return ownsAuthorizationCallback(callback, transaction) ? copyIntent(pending.intent) : undefined
  } catch {
    return undefined
  }
}

/**
 * A read-only startup probe for return recovery. Only `owned` is safe to route.
 * `invalid` never establishes callback ownership and is therefore suitable only
 * for a local warning plus an explicit dismiss action.
 */
export function inspectPendingAiReturn(callbackUrl?: string): PendingAiReturnStatus | undefined {
  const raw = readRawPending()
  if (!raw) return undefined
  let callback: URL
  try {
    callback = new URL(callbackUrl ?? globalThis.location.href)
  } catch {
    return undefined
  }
  if (!looksLikeOAuthCallback(callback)) return undefined

  const intent = safeIntent(raw.intent)
  if (
    raw.version !== 1
    || typeof raw.transaction !== 'string'
    || typeof raw.expiresAt !== 'string'
    || !isLocalId(raw.connectionEpoch)
  ) {
    return invalidReturn(intent, 'Saved OpenClaw return data is invalid. Dismiss it and connect again.')
  }

  try {
    const transaction = parseOpenClawAuthorizationTransaction(raw.transaction)
    if (intent && isStrictAuthorizationCallback(callback, transaction)) {
      return { kind: 'owned', intent }
    }
  } catch { /* malformed SDK transaction remains dismiss-only */ }
  return invalidReturn(intent, 'The saved OpenClaw return could not be verified. Dismiss it and connect again.')
}

export function readPendingAiAuthorization(
  storage: Pick<Storage, 'getItem'> | undefined = browserSessionStorage(),
): PendingAiAuthorization | undefined {
  if (!storage) return undefined
  try {
    const raw = storage.getItem(AI_PENDING_AUTHORIZATION_KEY)
    if (!raw) return undefined
    const value = JSON.parse(raw) as unknown
    if (!isPendingAuthorization(value)) return undefined
    return {
      version: 1,
      transaction: value.transaction,
      expiresAt: value.expiresAt,
      connectionEpoch: value.connectionEpoch,
      intent: copyIntent(value.intent),
    }
  } catch {
    return undefined
  }
}

export function ownsAuthorizationCallback(
  callback: URL,
  transaction: ReturnType<typeof parseOpenClawAuthorizationTransaction>,
): boolean {
  let redirect: URL
  try {
    redirect = new URL(transaction.redirectUri)
  } catch {
    return false
  }

  if (
    callback.username ||
    callback.password ||
    callback.hash ||
    callback.origin !== redirect.origin ||
    callback.pathname !== redirect.pathname ||
    singleValue(callback.searchParams, 'state') !== transaction.state ||
    singleValue(callback.searchParams, 'iss') !== transaction.issuer
  ) {
    return false
  }

  for (const [key, value] of redirect.searchParams) {
    if (singleValue(callback.searchParams, key) !== value) return false
  }

  return callback.searchParams.has('code') || callback.searchParams.has('error')
}

/** Full SDK-profile shape check performed only after state/issuer/URL ownership. */
export function isStrictAuthorizationCallback(
  callback: URL,
  transaction: ReturnType<typeof parseOpenClawAuthorizationTransaction>,
): boolean {
  if (!ownsAuthorizationCallback(callback, transaction)) return false

  const redirect = new URL(transaction.redirectUri)
  const hasCode = callback.searchParams.has('code')
  const hasError = callback.searchParams.has('error')
  if (hasCode === hasError) return false

  for (const key of new Set(callback.searchParams.keys())) {
    if (!redirect.searchParams.has(key) && !OAUTH_CALLBACK_KEYS.has(key)) return false
    if (singleValue(callback.searchParams, key) === undefined) return false
  }
  return true
}

export function stripOwnedAuthorizationParameters(callback: URL): URL {
  const clean = new URL(callback.href)
  for (const key of OAUTH_CALLBACK_KEYS) clean.searchParams.delete(key)
  return clean
}

function singleValue(params: URLSearchParams, name: string): string | undefined {
  const values = params.getAll(name)
  return values.length === 1 ? values[0] : undefined
}

function browserSessionStorage(): Storage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

function readRawPending(): Record<string, unknown> | undefined {
  const storage = browserSessionStorage()
  if (!storage) return undefined
  try {
    const raw = storage.getItem(AI_PENDING_AUTHORIZATION_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { malformed: true }
  } catch {
    return { malformed: true }
  }
}

function looksLikeOAuthCallback(callback: URL): boolean {
  return (callback.searchParams.has('code') || callback.searchParams.has('error'))
    && (callback.searchParams.has('state') || callback.searchParams.has('iss'))
}

function invalidReturn(
  intent: AiFeatureIntent | undefined,
  message: string,
): PendingAiReturnStatus {
  return { kind: 'invalid', ...(intent ? { intent } : {}), message }
}

function safeIntent(value: unknown): AiFeatureIntent | undefined {
  return isIntent(value) ? copyIntent(value) : undefined
}

function isPendingAuthorization(value: unknown): value is PendingAiAuthorization {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.version === 1
    && typeof record.transaction === 'string'
    && typeof record.expiresAt === 'string'
    && isLocalId(record.connectionEpoch)
    && isIntent(record.intent)
}

function isLocalId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value)
}

function isIntent(value: unknown): value is AiFeatureIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (
    (record.feature !== 'tutor' && record.feature !== 'remaster')
    || typeof record.bookId !== 'string'
    || typeof record.draft !== 'string'
  ) return false
  if (record.attachment === undefined) return true
  if (!record.attachment || typeof record.attachment !== 'object' || Array.isArray(record.attachment)) {
    return false
  }
  const attachment = record.attachment as Record<string, unknown>
  return typeof attachment.bookId === 'string' && isSelection(attachment.selection)
}

function isSelection(value: unknown): value is ReaderSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const selection = value as Record<string, unknown>
  if (typeof selection.quote !== 'string' || !selection.range || typeof selection.range !== 'object') {
    return false
  }
  const range = selection.range as Record<string, unknown>
  return typeof range.startCfi === 'string'
    && typeof range.endCfi === 'string'
    && (range.cfi === undefined || typeof range.cfi === 'string')
    && Number.isInteger(range.sectionIndex)
    && typeof range.textFingerprint === 'string'
}

function copyIntent(intent: AiFeatureIntent): AiFeatureIntent {
  return JSON.parse(JSON.stringify(intent)) as AiFeatureIntent
}
