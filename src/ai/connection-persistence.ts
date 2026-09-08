import {
  normalizeOpenClawProviderUrl,
  parseOpenClawConnection,
  serializeOpenClawConnection,
  type OpenClawConnection,
  type OpenClawConnectionExperience,
} from '@open-agent-connect/web'

export const AI_CONNECTION_KEY = 'bookhand.ai.connection.v1'
export const AI_CONNECTION_EPOCH_KEY = 'bookhand.ai.connection.epoch.v1'
export const AI_CONNECTION_PREFS_KEY = 'bookhand.ai.connection.preferences.v1'
export const AI_CONNECTION_LOCK = 'bookhand-ai-connection'
export const AI_REFRESH_BEFORE_MS = 60_000

export interface PersistedAiConnectionReady {
  readonly version: 1
  readonly status: 'ready'
  readonly id: string
  readonly epoch: string
  readonly appOrigin: string
  readonly experience: OpenClawConnectionExperience
  readonly grantExpiresAt: string
  readonly connection: OpenClawConnection
}

export interface PersistedAiConnectionRotating {
  readonly version: 1
  readonly status: 'rotating'
  readonly id: string
  readonly epoch: string
  readonly appOrigin: string
  readonly experience: OpenClawConnectionExperience
  readonly grantExpiresAt: string
  readonly startedAt: string
}

export type PersistedAiConnection = PersistedAiConnectionReady | PersistedAiConnectionRotating

export interface AiConnectionPreferences {
  readonly providerUrl: string
  readonly experience: OpenClawConnectionExperience
}

export function readAiConnectionPreferences(storage: Storage | undefined): AiConnectionPreferences {
  if (!storage) return { providerUrl: '', experience: 'tailscale' }
  try {
    const value = JSON.parse(storage.getItem(AI_CONNECTION_PREFS_KEY) ?? '') as Record<string, unknown>
    if (value.version !== 1 || Object.keys(value).some((key) => !['version', 'providerUrl', 'experience'].includes(key))) {
      return { providerUrl: '', experience: 'tailscale' }
    }
    return {
      providerUrl: safeProviderPreference(value.providerUrl),
      experience: value.experience === 'https' ? 'https' : 'tailscale',
    }
  } catch {
    return { providerUrl: '', experience: 'tailscale' }
  }
}

export function writeAiConnectionPreferences(storage: Storage | undefined, value: AiConnectionPreferences): void {
  storage?.setItem(AI_CONNECTION_PREFS_KEY, JSON.stringify({
    version: 1,
    providerUrl: safeProviderPreference(value.providerUrl),
    experience: value.experience === 'https' ? 'https' : 'tailscale',
  }))
}

export function readPersistedEpoch(storage: Storage | undefined): string | undefined {
  const value = storage?.getItem(AI_CONNECTION_EPOCH_KEY)
  return value && validId(value) ? value : undefined
}

export function writePersistedEpoch(storage: Storage, epoch: string): void {
  if (!validId(epoch)) throw new Error('Invalid AI connection epoch')
  storage.setItem(AI_CONNECTION_EPOCH_KEY, epoch)
}

export function peekPersistedConnectionId(storage: Storage | undefined): string | undefined {
  try {
    const value = JSON.parse(storage?.getItem(AI_CONNECTION_KEY) ?? '') as Record<string, unknown>
    return typeof value.id === 'string' && validId(value.id) ? value.id : undefined
  } catch { return undefined }
}

export async function readPersistedAiConnection(
  storage: Storage,
  appOrigin: string,
  now: number,
): Promise<PersistedAiConnection | undefined> {
  const raw = storage.getItem(AI_CONNECTION_KEY)
  if (!raw) return undefined
  if (new TextEncoder().encode(raw).byteLength > 256 * 1024) throw invalidRecord()
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw invalidRecord() }
  if (!isRecord(value) || value.version !== 1 || !validId(value.id) || !validId(value.epoch)) {
    throw invalidRecord()
  }
  if (value.appOrigin !== appOrigin || (value.experience !== 'tailscale' && value.experience !== 'https')) {
    throw invalidRecord()
  }
  const grantExpiry = date(value.grantExpiresAt)
  if (grantExpiry <= now) throw new Error('Saved AI authorization expired; connect again')
  if (value.status === 'rotating') {
    if (!hasExactKeys(value, ['version', 'status', 'id', 'epoch', 'appOrigin', 'experience', 'grantExpiresAt', 'startedAt'])) throw invalidRecord()
    if (typeof value.startedAt !== 'string' || !Number.isFinite(Date.parse(value.startedAt))) throw invalidRecord()
    return value as unknown as PersistedAiConnectionRotating
  }
  if (value.status !== 'ready' || !isRecord(value.connection)) throw invalidRecord()
  if (!hasExactKeys(value, ['version', 'status', 'id', 'epoch', 'appOrigin', 'experience', 'grantExpiresAt', 'connection'])) throw invalidRecord()
  let connection: OpenClawConnection
  try {
    connection = await parseOpenClawConnection(JSON.stringify(value.connection), { clientId: appOrigin, now })
  } catch (cause) {
    throw new Error('Saved AI authorization was invalid; connect again', { cause })
  }
  // Provider validation cannot renew Bookhand's originally consented lifetime.
  if (date(connection.refreshTokenExpiresAt) > grantExpiry) {
    throw new Error('Saved AI authorization expired; connect again')
  }
  return Object.freeze({ ...value, connection }) as unknown as PersistedAiConnectionReady
}

export function readyRecord(options: {
  readonly id: string
  readonly epoch: string
  readonly appOrigin: string
  readonly experience: OpenClawConnectionExperience
  readonly grantExpiresAt: string
  readonly connection: OpenClawConnection
}): PersistedAiConnectionReady {
  return Object.freeze({ version: 1, status: 'ready', ...options })
}

export function rotatingRecord(record: PersistedAiConnectionReady, now: number): PersistedAiConnectionRotating {
  return Object.freeze({
    version: 1,
    status: 'rotating',
    id: record.id,
    epoch: record.epoch,
    appOrigin: record.appOrigin,
    experience: record.experience,
    grantExpiresAt: record.grantExpiresAt,
    startedAt: new Date(now).toISOString(),
  })
}

export function writePersistedAiConnection(storage: Storage, record: PersistedAiConnection): void {
  const serialized = record.status === 'ready'
    ? { ...record, connection: JSON.parse(serializeOpenClawConnection(record.connection)) as unknown }
    : record
  storage.setItem(AI_CONNECTION_KEY, JSON.stringify(serialized))
}

export function clampConnectionGrant(
  connection: OpenClawConnection,
  grantExpiresAt: string,
): OpenClawConnection {
  const clamped = Math.min(date(connection.refreshTokenExpiresAt), date(grantExpiresAt))
  return Object.freeze({ ...connection, refreshTokenExpiresAt: new Date(clamped).toISOString() })
}

function date(value: unknown): number {
  const result = typeof value === 'string' ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(result)) throw invalidRecord()
  return result
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value)
}

function safeProviderPreference(value: unknown): string {
  if (value === '') return ''
  if (typeof value !== 'string' || value.length > 2_000) return ''
  try { return normalizeOpenClawProviderUrl(value) } catch { return '' }
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && Object.keys(value).every((key) => expected.includes(key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function invalidRecord(): Error {
  return new Error('Saved AI authorization was invalid; connect again')
}
