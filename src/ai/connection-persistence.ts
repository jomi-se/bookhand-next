import {
  createAiSdkApplicationTools,
  type ApplicationTool,
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
  const connection = value.connection as unknown as OpenClawConnection
  validateConnection(connection, appOrigin, now, grantExpiry)
  const hash = await applicationToolsHash(connection.applicationTools)
  if (hash !== connection.applicationToolsHash) throw invalidRecord()
  return value as unknown as PersistedAiConnectionReady
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
  storage.setItem(AI_CONNECTION_KEY, JSON.stringify(record))
}

export function clampConnectionGrant(
  connection: OpenClawConnection,
  grantExpiresAt: string,
): OpenClawConnection {
  const clamped = Math.min(date(connection.refreshTokenExpiresAt), date(grantExpiresAt))
  return Object.freeze({ ...connection, refreshTokenExpiresAt: new Date(clamped).toISOString() })
}

function validateConnection(
  value: OpenClawConnection,
  appOrigin: string,
  now: number,
  grantExpiry: number,
): void {
  if (!hasExactKeys(value as unknown as Record<string, unknown>, [
    'version', 'providerOrigin', 'endpoint', 'clientId', 'accessToken', 'refreshToken', 'expiresAt',
    'refreshTokenExpiresAt', 'model', 'applicationTools', 'applicationToolsHash',
  ])) throw invalidRecord()
  if (value.version !== 1 || canonicalOrigin(value.providerOrigin) !== value.providerOrigin) throw invalidRecord()
  if (value.endpoint !== `${value.providerOrigin}/v1/responses` || value.clientId !== appOrigin) throw invalidRecord()
  if (value.model !== 'openclaw/default' || !bounded(value.accessToken) || !bounded(value.refreshToken)) throw invalidRecord()
  date(value.expiresAt)
  const refreshExpiry = date(value.refreshTokenExpiresAt)
  if (refreshExpiry <= now || refreshExpiry > grantExpiry) throw new Error('Saved AI authorization expired; connect again')
  if (!validTools(value.applicationTools) || !/^[A-Za-z0-9_-]{43}$/.test(value.applicationToolsHash)) throw invalidRecord()
  try {
    createAiSdkApplicationTools(value.applicationTools.map((descriptor): ApplicationTool => ({
      ...descriptor,
      execute: async () => ({ content: [] }),
    })), { connectionId: 'restore-validation' })
  } catch {
    throw invalidRecord()
  }
}

function validTools(value: unknown): value is OpenClawConnection['applicationTools'] {
  if (!Array.isArray(value) || value.length > 32) return false
  const names = new Set<string>()
  return value.every((tool) => {
    if (!isRecord(tool) || Object.keys(tool).some((key) => !['name', 'description', 'inputSchema'].includes(key))) return false
    if (typeof tool.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(tool.name) || names.has(tool.name)) return false
    names.add(tool.name)
    return typeof tool.description === 'string' && tool.description.length > 0 && tool.description.length <= 2_000
      && isJsonObject(tool.inputSchema)
  })
}

function isJsonObject(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isJsonObject(value)
}

async function applicationToolsHash(tools: OpenClawConnection['applicationTools']): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(tools))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return base64Url(new Uint8Array(digest))
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function canonicalOrigin(value: unknown): string {
  if (typeof value !== 'string') throw invalidRecord()
  let url: URL
  try { url = new URL(value) } catch { throw invalidRecord() }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw invalidRecord()
  }
  return url.origin
}

function date(value: unknown): number {
  const result = typeof value === 'string' ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(result)) throw invalidRecord()
  return result
}

function bounded(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 8_192
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value)
}

function safeProviderPreference(value: unknown): string {
  if (value === '') return ''
  if (typeof value !== 'string' || value.length > 2_000) return ''
  try { return canonicalOrigin(value) } catch { return '' }
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
