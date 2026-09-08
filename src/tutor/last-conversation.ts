export const TUTOR_LAST_CONVERSATIONS_KEY = 'bookhand.tutor.last-conversations'

const ASSOCIATION_VERSION = 1
const MAX_ASSOCIATIONS = 16
const MAX_ASSOCIATION_FIELD = 1_024
const MAX_SERIALIZED_ASSOCIATIONS = 16_384
const LOCK_PREFIX = 'bookhand.tutor.conversation.'

export interface LastConversationAssociation {
  readonly version: 1
  readonly bookId: string
  readonly scopeId: string
  readonly previousResponseId: string
}

export interface TutorConversationLock {
  request<T>(
    name: string,
    options: { readonly mode: 'exclusive'; readonly ifAvailable: true },
    callback: (lock: unknown | null) => T | Promise<T>,
  ): Promise<T>
}

export interface LastConversationPlatform {
  readonly storage?: Storage
  readonly locks?: TutorConversationLock
  readonly now: () => number
}

export interface ConversationLease {
  readonly scopeId: string
  readonly previousResponseId: string
  release(): void
}

export class LastConversationStore {
  readonly #platform: LastConversationPlatform

  constructor(platform: Partial<LastConversationPlatform> = {}) {
    this.#platform = {
      storage: 'storage' in platform ? platform.storage : defaultSessionStorage(),
      locks: 'locks' in platform ? platform.locks : defaultLocks(),
      now: platform.now ?? Date.now,
    }
  }

  get available(): boolean {
    return this.#platform.storage !== undefined && this.#platform.locks !== undefined
  }

  get storageAvailable(): boolean {
    return this.#platform.storage !== undefined
  }

  now(): number {
    return this.#platform.now()
  }

  read(bookId: string, scopeId: string): LastConversationAssociation | undefined {
    return this.#readAll().find(
      (entry) => entry.bookId === bookId && entry.scopeId === scopeId,
    )
  }

  save(bookId: string, scopeId: string, previousResponseId: string): void {
    const association = associationFrom({ bookId, scopeId, previousResponseId })
    const retained = this.#readAll().filter(
      (entry) => !(entry.bookId === bookId && entry.scopeId === scopeId),
    )
    this.#writeAll([association, ...retained].slice(0, MAX_ASSOCIATIONS))
  }

  clear(bookId: string, scopeId: string): void {
    const existing = this.#readAll()
    const retained = existing.filter(
      (entry) => !(entry.bookId === bookId && entry.scopeId === scopeId),
    )
    if (retained.length !== existing.length) this.#writeAll(retained)
  }

  clearScope(scopeId: string): void {
    try {
      const existing = this.#readAll()
      const retained = existing.filter((entry) => entry.scopeId !== scopeId)
      if (retained.length !== existing.length) this.#writeAll(retained)
    } catch {
      this.#platform.storage?.removeItem(TUTOR_LAST_CONVERSATIONS_KEY)
    }
  }

  clearBook(bookId: string): void {
    try {
      const existing = this.#readAll()
      const retained = existing.filter((entry) => entry.bookId !== bookId)
      if (retained.length !== existing.length) this.#writeAll(retained)
    } catch {
      this.#platform.storage?.removeItem(TUTOR_LAST_CONVERSATIONS_KEY)
    }
  }

  async acquire(
    scopeId: string,
    previousResponseId: string,
  ): Promise<ConversationLease | undefined> {
    const locks = this.#platform.locks
    if (!locks) return undefined

    let resolveAcquisition!: (lease: ConversationLease | undefined) => void
    let rejectAcquisition!: (reason: unknown) => void
    const acquisition = new Promise<ConversationLease | undefined>((resolve, reject) => {
      resolveAcquisition = resolve
      rejectAcquisition = reject
    })
    let releaseHold!: () => void
    const hold = new Promise<void>((resolve) => {
      releaseHold = resolve
    })
    let released = false
    const lease: ConversationLease = Object.freeze({
      scopeId,
      previousResponseId,
      release: () => {
        if (released) return
        released = true
        releaseHold()
      },
    })

    void locks.request(
      lockName(scopeId, previousResponseId),
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        if (!lock) {
          resolveAcquisition(undefined)
          return
        }
        resolveAcquisition(lease)
        await hold
      },
    ).catch(rejectAcquisition)

    return acquisition
  }

  #readAll(): readonly LastConversationAssociation[] {
    const storage = this.#platform.storage
    if (!storage) return Object.freeze([])
    const serialized = storage.getItem(TUTOR_LAST_CONVERSATIONS_KEY)
    if (serialized === null) return Object.freeze([])
    if (serialized.length > MAX_SERIALIZED_ASSOCIATIONS) {
      throw new Error('Saved tutor conversation data is invalid')
    }
    const parsed: unknown = JSON.parse(serialized)
    if (!Array.isArray(parsed) || parsed.length > MAX_ASSOCIATIONS) {
      throw new Error('Saved tutor conversation data is invalid')
    }
    return Object.freeze(parsed.map(parseAssociation))
  }

  #writeAll(associations: readonly LastConversationAssociation[]): void {
    const storage = this.#platform.storage
    if (!storage) throw new Error('Tutor conversation storage is unavailable')
    if (associations.length === 0) {
      storage.removeItem(TUTOR_LAST_CONVERSATIONS_KEY)
      return
    }
    const serialized = JSON.stringify(associations)
    if (serialized.length > MAX_SERIALIZED_ASSOCIATIONS) {
      throw new Error('Saved tutor conversation data is too large')
    }
    storage.setItem(TUTOR_LAST_CONVERSATIONS_KEY, serialized)
  }
}

function associationFrom(value: {
  readonly bookId: string
  readonly scopeId: string
  readonly previousResponseId: string
}): LastConversationAssociation {
  if (
    !value.bookId.trim()
    || !value.scopeId.trim()
    || !value.previousResponseId.trim()
    || value.bookId.length > MAX_ASSOCIATION_FIELD
    || value.scopeId.length > MAX_ASSOCIATION_FIELD
    || value.previousResponseId.length > MAX_ASSOCIATION_FIELD
  ) {
    throw new TypeError('Tutor conversation association fields are required')
  }
  return Object.freeze({ version: ASSOCIATION_VERSION, ...value })
}

function parseAssociation(value: unknown): LastConversationAssociation {
  if (
    value === null
    || typeof value !== 'object'
    || Object.keys(value).length !== 4
    || !('version' in value) || value.version !== ASSOCIATION_VERSION
    || !('bookId' in value) || typeof value.bookId !== 'string'
    || !('scopeId' in value) || typeof value.scopeId !== 'string'
    || !('previousResponseId' in value) || typeof value.previousResponseId !== 'string'
  ) {
    throw new Error('Saved tutor conversation data is invalid')
  }
  return associationFrom(value as Omit<LastConversationAssociation, 'version'>)
}

function lockName(scopeId: string, previousResponseId: string): string {
  return `${LOCK_PREFIX}${encodeURIComponent(scopeId)}.${encodeURIComponent(previousResponseId)}`
}

function defaultSessionStorage(): Storage | undefined {
  try {
    return globalThis.window?.sessionStorage
  } catch {
    return undefined
  }
}

function defaultLocks(): TutorConversationLock | undefined {
  return globalThis.navigator?.locks as TutorConversationLock | undefined
}
