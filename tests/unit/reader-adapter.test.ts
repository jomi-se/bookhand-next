import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createElement, StrictMode } from 'react'
import { render, waitFor } from '@testing-library/react'
import type { BookMetadata, ReaderSelection } from '../../src/domain/reader.ts'
import {
  FoliateReaderAdapter,
  ReaderHost,
  ReaderNavigationError,
  ReaderSectionLoadError,
} from '../../src/reader/index.ts'
import type {
  FoliateBook,
  FoliateDrawFunction,
  FoliateModule,
  FoliateRenderer,
  FoliateResolvedTarget,
  FoliateView,
} from '../../src/reader/foliate-types.ts'

const sectionMarkup = [
  '<h1>Chapter One</h1><p>Alpha exact passage for selection.</p>',
  '<h1>Chapter Two</h1><p>Beta destination text with a figure.</p><figure><img alt="A rising curve"><figcaption>Figure one</figcaption></figure>',
] as const

class FakeFoliateView extends HTMLElement implements FoliateView {
  book!: FoliateBook
  renderer: FoliateRenderer
  history = { pushState: vi.fn() }
  lastLocation?: {
    cfi: string
    range: Range
    fraction: number
    section: { current: number }
    tocItem: { label: string }
  }
  readonly overlayAdd = vi.fn()
  readonly overlayRemove = vi.fn()

  constructor() {
    super()
    const renderer = document.createElement('div') as unknown as FoliateRenderer
    let current = 0
    let currentDocument = makeDocument(sectionMarkup[current])
    renderer.getContents = () => [{
      index: current,
      doc: currentDocument,
      overlayer: {
        add: this.overlayAdd,
        remove: this.overlayRemove,
      },
    }]
    renderer.setStyles = vi.fn()
    renderer.goTo = vi.fn(async (target: FoliateResolvedTarget) => {
      current = target.index
      currentDocument = makeDocument(sectionMarkup[current] ?? '')
      this.dispatchEvent(new CustomEvent('load', { detail: { doc: currentDocument, index: current } }))
      this.relocate(current, currentDocument)
    })
    renderer.prev = vi.fn(async () => renderer.goTo({ index: Math.max(0, current - 1) }))
    renderer.next = vi.fn(async () => renderer.goTo({ index: Math.min(1, current + 1) }))
    this.renderer = renderer
  }

  async open(book: FoliateBook) {
    this.book = book
    this.append(this.renderer)
  }

  async init(options?: { lastLocation?: string; showTextStart?: boolean }) {
    const target = options?.lastLocation
      ? this.resolveNavigation(options.lastLocation) ?? { index: 0 }
      : { index: 0 }
    await this.renderer.goTo(target)
  }

  close = vi.fn(() => this.replaceChildren())

  getCFI(index: number, range?: Range): string {
    const start = range?.startOffset ?? 0
    const end = range?.endOffset ?? start
    return `fixture:${index}:${start}:${end}`
  }

  resolveNavigation(target: string | number): FoliateResolvedTarget | undefined {
    if (typeof target === 'number') return target >= 0 && target < 2 ? { index: target } : undefined
    if (target.startsWith('fixture:')) return { index: Number(target.split(':')[1]) }
    if (target.startsWith('chapter-1')) return { index: 0 }
    if (target.startsWith('chapter-2')) return { index: 1 }
    return undefined
  }

  deselect() {
    for (const { doc } of this.renderer.getContents()) doc.getSelection()?.removeAllRanges()
  }

  private relocate(index: number, doc: Document) {
    const range = doc.createRange()
    range.selectNodeContents(doc.querySelector('p')!)
    this.renderer.dispatchEvent(new CustomEvent('relocate', {
      detail: { reason: 'navigation', range, index },
    }))
    this.lastLocation = {
      cfi: `fixture:${index}:0:0`,
      range,
      fraction: index / 2,
      section: { current: index },
      tocItem: { label: `Chapter ${index + 1}` },
    }
    this.dispatchEvent(new CustomEvent('relocate', { detail: this.lastLocation }))
  }
}

beforeAll(() => {
  if (!customElements.get('foliate-view')) customElements.define('foliate-view', FakeFoliateView)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'startViewTransition')
  document.body.replaceChildren()
})

describe('FoliateReaderAdapter', () => {
  it('attributes programmatic relocations and removes failed navigation identities', async () => {
    const relocations: { sectionIndex: number; navigationId?: number }[] = []
    let failSection = false
    const adapter = makeAdapter(document.createElement('div'), {
      onLocationChange: (location, navigationId) => {
        relocations.push({
          sectionIndex: location.sectionIndex,
          ...(navigationId === undefined ? {} : { navigationId }),
        })
      },
      faults: {
        beforeSectionLoad: async (sectionIndex) => {
          if (failSection && sectionIndex === 1) throw new Error('blocked')
        },
      },
    })
    await adapter.open(new Blob(['fixture']))

    await adapter.navigate({ kind: 'href', href: 'chapter-2.xhtml' }, 41)
    expect(relocations.at(-1)).toEqual({ sectionIndex: 1, navigationId: 41 })
    await adapter.navigate({ kind: 'relative', direction: 'previous' }, 42)
    expect(relocations.at(-1)).toEqual({ sectionIndex: 0, navigationId: 42 })

    failSection = true
    await expect(adapter.navigate({ kind: 'section', sectionIndex: 1 }, 43)).rejects.toBeInstanceOf(
      ReaderSectionLoadError,
    )
    failSection = false
    await adapter.navigate({ kind: 'section', sectionIndex: 1 })
    expect(relocations.at(-1)).toEqual({ sectionIndex: 1 })
  })

  it('keeps the retained page painted with a document transition at a section boundary', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const startViewTransition = vi.fn((update: () => void | Promise<void>) => {
      const updateCallbackDone = Promise.resolve().then(update)
      return {
        ready: Promise.resolve(),
        updateCallbackDone,
        finished: updateCallbackDone.then(() => undefined),
        skipTransition: vi.fn(),
        types: new Set<string>(),
      } as unknown as ViewTransition
    })
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    })
    const adapter = makeAdapter(document.createElement('div'))
    await adapter.open(new Blob(['fixture']))
    const view = document.querySelector('foliate-view') as FakeFoliateView
    const renderer = view.renderer
    Object.defineProperties(renderer, {
      page: { configurable: true, get: () => 0 },
      pages: { configurable: true, get: () => 1 },
      atStart: { configurable: true, get: () => false },
      atEnd: { configurable: true, get: () => false },
    })

    await adapter.navigate({ kind: 'relative', direction: 'next' })

    expect(startViewTransition).toHaveBeenCalledOnce()
    expect(view.style.viewTransitionName).toBe('')
    expect(document.documentElement).not.toHaveClass('bookhand-spine-turn')
    expect(adapter.getLocation().sectionIndex).toBe(1)

    startViewTransition.mockImplementationOnce(() => { throw new Error('transition unavailable') })
    await expect(adapter.navigate({ kind: 'relative', direction: 'previous' })).resolves.toBeUndefined()
    expect(adapter.getLocation().sectionIndex).toBe(0)
    expect(view.style.viewTransitionName).toBe('')
    expect(document.documentElement).not.toHaveClass('bookhand-spine-turn')
  })

  it('does not publish a retired relocation as the adapter location', async () => {
    const adapter = makeAdapter(document.createElement('div'), {
      onLocationChange: (_location, navigationId) => navigationId !== 41,
    })
    await adapter.open(new Blob(['fixture']))
    expect(adapter.getLocation().sectionIndex).toBe(0)

    await adapter.navigate({ kind: 'section', sectionIndex: 1 }, 41)

    expect(adapter.getLocation().sectionIndex).toBe(0)
  })

  it('serializes an in-book link behind an unsettled issued navigation with exact identities', async () => {
    const relocations: (number | undefined)[] = []
    let adapter!: FoliateReaderAdapter
    let linkNavigation!: Promise<void>
    adapter = makeAdapter(document.createElement('div'), {
      onLocationChange: (_location, navigationId) => { relocations.push(navigationId) },
      onNavigationRequest: (target) => { linkNavigation = adapter.navigate(target, 52) },
    })
    await adapter.open(new Blob(['fixture']))
    await adapter.navigate({ kind: 'section', sectionIndex: 1 })
    relocations.length = 0
    const view = document.querySelector('foliate-view') as FakeFoliateView
    const originalGoTo = view.renderer.goTo.bind(view.renderer)
    let release!: () => void
    const barrier = new Promise<void>((resolve) => { release = resolve })
    let first = true
    view.renderer.goTo = vi.fn(async (target: FoliateResolvedTarget) => {
      if (first) {
        first = false
        await barrier
      }
      await originalGoTo(target)
    })

    const issued = adapter.navigate({ kind: 'section', sectionIndex: 1 }, 51)
    await Promise.resolve()
    const link = new CustomEvent('link', {
      detail: { href: 'chapter-1.xhtml' },
      cancelable: true,
    })
    view.dispatchEvent(link)
    expect(link.defaultPrevented).toBe(true)
    release()
    await issued
    await linkNavigation

    expect(relocations).toEqual([51, 52])
    expect(adapter.getLocation().sectionIndex).toBe(0)
  })

  it('replaces a stalled Foliate view and lets the queued learner link proceed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const relocations: (number | undefined)[] = []
    let adapter!: FoliateReaderAdapter
    let linkNavigation!: Promise<void>
    adapter = makeAdapter(document.createElement('div'), {
      navigationDeadlineMs: 10,
      onLocationChange: (_location, navigationId) => { relocations.push(navigationId) },
      onNavigationRequest: (target) => { linkNavigation = adapter.navigate(target, 72) },
    })
    await adapter.open(new Blob(['fixture']))
    await adapter.navigate({ kind: 'section', sectionIndex: 1 }, 70)
    expect(adapter.getLocation().sectionIndex).toBe(1)
    relocations.length = 0
    const stalledView = document.querySelector('foliate-view') as FakeFoliateView
    stalledView.renderer.goTo = vi.fn(async () => new Promise<void>(() => undefined))

    const stalled = adapter.navigate({ kind: 'section', sectionIndex: 0 }, 71)
    await Promise.resolve()
    const link = new CustomEvent('link', {
      detail: { href: 'chapter-1.xhtml' },
      cancelable: true,
    })
    stalledView.dispatchEvent(link)

    await expect(stalled).rejects.toBeInstanceOf(ReaderNavigationError)
    await linkNavigation
    const replacement = document.querySelector('foliate-view') as FakeFoliateView
    expect(replacement).not.toBe(stalledView)
    expect(adapter.getLocation().sectionIndex).toBe(0)
    expect(relocations).toEqual([72])
  })

  it('keeps the last reader and location when navigation and recovery both fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const adapter = makeAdapter(document.createElement('div'), { navigationDeadlineMs: 10 })
    await adapter.open(new Blob(['fixture']))
    await adapter.navigate({ kind: 'section', sectionIndex: 1 })

    const workingView = document.querySelector('foliate-view') as FakeFoliateView
    workingView.renderer.goTo = vi.fn(async () => new Promise<void>(() => undefined))
    vi.spyOn(FakeFoliateView.prototype, 'open').mockImplementation(async function (
      this: FakeFoliateView,
    ) {
      if (this !== workingView) throw new Error('Replacement failed to initialize')
    })

    await expect(adapter.navigate({ kind: 'section', sectionIndex: 0 })).rejects.toBeInstanceOf(
      ReaderNavigationError,
    )

    expect(document.querySelectorAll('foliate-view')).toHaveLength(1)
    expect(document.querySelector('foliate-view')).toBe(workingView)
    expect(adapter.getLocation()).toMatchObject({ sectionIndex: 1 })
  })

  it('publishes a chapter location only after its render operation succeeds', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const published: number[] = []
    const adapter = makeAdapter(document.createElement('div'), {
      onLocationChange: (location) => { published.push(location.sectionIndex) },
    })
    await adapter.open(new Blob(['fixture']))
    const view = document.querySelector('foliate-view') as FakeFoliateView
    const render = view.renderer.goTo.bind(view.renderer)
    published.length = 0
    view.renderer.goTo = vi.fn(async (target: FoliateResolvedTarget) => {
      await render(target)
      throw new Error('Renderer failed after relocation')
    })

    await expect(adapter.navigate({ kind: 'section', sectionIndex: 1 })).rejects.toBeInstanceOf(
      ReaderSectionLoadError,
    )

    expect(published).toEqual([])
    expect(adapter.getLocation()).toMatchObject({ sectionIndex: 0 })
  })

  it('does not let an incidental anchor reflow consume an issued navigation identity', async () => {
    const relocations: (number | undefined)[] = []
    const adapter = makeAdapter(document.createElement('div'), {
      onLocationChange: (_location, navigationId) => { relocations.push(navigationId) },
    })
    await adapter.open(new Blob(['fixture']))
    relocations.length = 0
    const view = document.querySelector('foliate-view') as FakeFoliateView
    const originalGoTo = view.renderer.goTo.bind(view.renderer)
    let release!: () => void
    const barrier = new Promise<void>((resolve) => { release = resolve })
    view.renderer.goTo = vi.fn(async (target: FoliateResolvedTarget) => {
      await barrier
      await originalGoTo(target)
    })

    const issued = adapter.navigate({ kind: 'section', sectionIndex: 1 }, 61)
    await Promise.resolve()
    const current = view.lastLocation!
    view.renderer.dispatchEvent(new CustomEvent('relocate', {
      detail: { reason: 'anchor', range: current.range, index: 0 },
    }))
    view.dispatchEvent(new CustomEvent('relocate', { detail: current }))
    release()
    await issued

    expect(relocations).toEqual([undefined, 61])
  })

  it('attributes a fixed-layout-shaped relocation with no reason to its issued move', async () => {
    const relocations: (number | undefined)[] = []
    const adapter = makeAdapter(document.createElement('div'), {
      onLocationChange: (_location, navigationId) => { relocations.push(navigationId) },
    })
    await adapter.open(new Blob(['fixture']))
    relocations.length = 0
    const view = document.querySelector('foliate-view') as FakeFoliateView
    const current = view.lastLocation!
    view.renderer.goTo = vi.fn(async () => {
      view.renderer.dispatchEvent(new CustomEvent('relocate', {
        detail: { range: null, index: 0 },
      }))
      view.dispatchEvent(new CustomEvent('relocate', { detail: current }))
    })

    await adapter.navigate({ kind: 'section', sectionIndex: 1 }, 62)

    expect(relocations).toEqual([62])
  })

  it('publishes fixture-grounded metadata, nested TOC, sections, location, and text snapshots', async () => {
    const host = document.createElement('div')
    const adapter = makeAdapter(host)

    const metadata = await adapter.open(new Blob(['fixture']))

    expect(metadata).toEqual<BookMetadata>({
      title: 'Tiny Technical Book',
      subtitle: 'A deterministic fixture',
      authors: [{ name: 'Ada Reader', sortAs: 'Reader, Ada' }],
      language: 'en',
      publisher: 'Bookhand Fixtures',
      identifier: 'urn:bookhand:tiny',
      cover: { mediaType: 'image/svg+xml', bytes: new Uint8Array([1, 2, 3]) },
    })
    expect(adapter.getToc()[0]?.children[0]?.label).toBe('Nested destination')
    expect(adapter.listSections()).toEqual([
      { index: 0, id: 'chapter-1.xhtml', href: 'chapter-1.xhtml', label: 'Chapter one', linear: true },
      { index: 1, id: 'chapter-2.xhtml', href: 'chapter-2.xhtml', label: 'Nested destination', linear: true },
    ])
    expect(adapter.getLocation()).toMatchObject({ sectionIndex: 0, chapterLabel: 'Chapter 1' })
    await expect(adapter.getSectionSnapshot(1)).resolves.toMatchObject({
      sectionIndex: 1,
      text: 'Chapter Two Beta destination text with a figure. A rising curve Figure one',
      chapterBreadcrumb: ['Nested destination'],
    })

    expect(() => structuredClone(metadata)).not.toThrow()
    expect(() => structuredClone(adapter.getToc())).not.toThrow()
    expect(() => structuredClone(adapter.getLocation())).not.toThrow()
    expect(() => structuredClone(adapter.listSections())).not.toThrow()
    expect(containsDomValue(metadata)).toBe(false)
  })

  it('captures an exact selection, round-trips it in a fresh section, and clears it on navigation', async () => {
    const selectionChanges: (ReaderSelection | null)[] = []
    const adapter = makeAdapter(document.createElement('div'), {
      onSelectionChange: (selection) => selectionChanges.push(selection),
    })
    await adapter.open(new Blob(['fixture']))
    const view = document.querySelector('foliate-view') as FakeFoliateView
    const doc = view.renderer.getContents()[0]!.doc
    const text = doc.querySelector('p')!.firstChild!
    const range = doc.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 11)
    let selectedRange: Range | undefined = range
    Object.defineProperty(doc, 'getSelection', {
      configurable: true,
      value: () => ({
        get rangeCount() {
          return selectedRange ? 1 : 0
        },
        get isCollapsed() {
          return selectedRange?.collapsed ?? true
        },
        getRangeAt: () => selectedRange!,
        removeAllRanges: () => {
          selectedRange = undefined
        },
      }),
    })
    doc.dispatchEvent(new Event('selectionchange'))

    const saved = adapter.getSelection()
    expect(saved?.quote).toBe('Alpha exact')
    expect(saved?.range).toMatchObject({
      startCfi: 'fixture:0:0:0',
      endCfi: 'fixture:0:11:11',
      sectionIndex: 0,
    })
    await expect(adapter.getPassage(saved!.range)).resolves.toMatchObject({ text: 'Alpha exact' })

    const staleDocument = doc
    await adapter.navigate({ kind: 'href', href: 'chapter-2.xhtml' })
    expect(adapter.getSelection()).toBeNull()
    expect(selectionChanges.at(-1)).toBeNull()
    expect(adapter.getLocation()).toMatchObject({ sectionIndex: 1 })
    staleDocument.dispatchEvent(new Event('selectionchange'))
    expect(adapter.getSelection()).toBeNull()
  })

  it('rejects a fingerprint mismatch instead of resolving unrelated text', async () => {
    const adapter = makeAdapter(document.createElement('div'))
    await adapter.open(new Blob(['fixture']))
    await expect(
      adapter.getPassage({
        startCfi: 'fixture:0:0:0',
        endCfi: 'fixture:0:5:5',
        sectionIndex: 0,
        textFingerprint: 'fnv1a-deadbeef',
      }),
    ).rejects.toThrow('fingerprint mismatch')
  })

  it('names invalid navigation and wraps injected section failures without replacing the viewer', async () => {
    let failSection = false
    const errors: ReaderSectionLoadError[] = []
    const adapter = makeAdapter(document.createElement('div'), {
      faults: {
        beforeSectionLoad: async () => {
          if (failSection) throw new Error('Injected section-load failure')
        },
      },
      onSectionError: (error) => errors.push(error),
    })
    await adapter.open(new Blob(['fixture']))
    const original = document.querySelector('foliate-view')

    await expect(adapter.navigate({ kind: 'href', href: 'missing.xhtml' })).rejects.toBeInstanceOf(
      ReaderNavigationError,
    )
    failSection = true
    await expect(adapter.navigate({ kind: 'section', sectionIndex: 1 })).rejects.toMatchObject({
      name: 'ReaderSectionLoadError',
      sectionIndex: 1,
      sectionLabel: 'Nested destination',
    })
    expect(errors).toHaveLength(1)
    expect(document.querySelector('foliate-view')).toBe(original)
    failSection = false
    await expect(adapter.navigate({ kind: 'section', sectionIndex: 1 })).resolves.toBeUndefined()
    expect(adapter.getLocation()).toMatchObject({ sectionIndex: 1 })
    expect(document.querySelector('foliate-view')).toBe(original)
  })

  it('supports direct CFI, relative navigation, and scoped style/reset primitives', async () => {
    const adapter = makeAdapter(document.createElement('div'))
    await adapter.open(new Blob(['fixture']))
    const view = document.querySelector('foliate-view') as FakeFoliateView
    const setStyles = vi.mocked(view.renderer.setStyles!)

    await adapter.navigate({ kind: 'cfi', cfi: 'fixture:1:0:0' })
    expect(adapter.getLocation()).toMatchObject({ sectionIndex: 1 })
    await adapter.navigate({ kind: 'relative', direction: 'previous' })
    expect(adapter.getLocation()).toMatchObject({ sectionIndex: 0 })
    await adapter.navigate({ kind: 'relative', direction: 'next' })
    expect(adapter.getLocation()).toMatchObject({ sectionIndex: 1 })

    adapter.applyStyle({
      fontFamily: 'Atkinson Hyperlegible',
      fontSizePercent: 112,
      lineHeight: 1.7,
      measureCh: 60,
      paragraphSpacingEm: 1,
      theme: 'sepia',
      customCss: 'h1 { letter-spacing: 0.01em; }',
    })
    expect(setStyles.mock.lastCall?.[0]).toContain('font-size: 112%')
    expect(setStyles.mock.lastCall?.[0]).toContain('background: #f4efe4')
    expect(setStyles.mock.lastCall?.[0]).toContain('h1 { letter-spacing: 0.01em; }')
    adapter.applyStyle({
      ...adapter.getStyle(),
      theme: 'dark',
    })
    expect(setStyles.mock.lastCall?.[0]).toContain('background: #171717')
    expect(setStyles.mock.lastCall?.[0]).toContain('img[data-tex] { filter: invert(1); }')
    adapter.resetStyle()
    expect(setStyles.mock.lastCall?.[0]).toContain('font-size: 100%')
    expect(setStyles.mock.lastCall?.[0]).not.toContain('letter-spacing')
  })

  it('times out an unresolved open and removes its viewer state', async () => {
    vi.useFakeTimers()
    const adapter = makeAdapter(document.createElement('div'), {
      openDeadlineMs: 10_000,
      faults: { beforeOpen: () => new Promise<never>(() => undefined) },
    })
    const open = adapter.open(new Blob(['fixture']))
    const rejection = expect(open).rejects.toMatchObject({ name: 'DeadlineExceededError', deadlineMs: 10_000 })
    await vi.advanceTimersByTimeAsync(10_000)
    await rejection
    expect(document.querySelector('foliate-view')).toBeNull()
  })

  it('discards a delayed stale open and retains only the latest viewer', async () => {
    let releaseFirst!: () => void
    let markFirstStarted!: () => void
    let calls = 0
    const firstReady = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })
    const books: FoliateBook[] = []
    const module: FoliateModule = {
      async makeBook() {
        calls += 1
        if (calls === 1) {
          markFirstStarted()
          await firstReady
        }
        const book = makeBook()
        books.push(book)
        return book
      },
    }
    const host = document.createElement('div')
    document.body.append(host)
    const adapter = new FoliateReaderAdapter(host, {}, { loadFoliate: async () => module })

    const stale = adapter.open(new Blob(['first']))
    await firstStarted
    const latest = adapter.open(new Blob(['second']))
    await expect(latest).resolves.toMatchObject({ title: 'Tiny Technical Book' })
    releaseFirst()
    await expect(stale).rejects.toMatchObject({ name: 'ReaderClosedError' })
    expect(host.querySelectorAll('foliate-view')).toHaveLength(1)
    expect(books).toHaveLength(2)
    const latestBook = books.find((book) => !(book.destroy as ReturnType<typeof vi.fn>).mock.calls.length)
    expect(latestBook).toBeDefined()

    await adapter.close()
    expect(host.children).toHaveLength(0)
    expect(latestBook!.destroy).toHaveBeenCalledOnce()
  })

  it('keeps the selection when the paginator merely relocates, and drops it on deliberate navigation', async () => {
    const host = document.createElement('div')
    const adapter = makeAdapter(host)
    await adapter.open(new Blob(['fixture']))
    const view = host.querySelector('foliate-view') as unknown as FakeFoliateView
    const doc = view.renderer.getContents()[0]!.doc
    const text = doc.querySelector('p')!.firstChild!
    const range = doc.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 11)
    let selectedRange: Range | undefined = range
    Object.defineProperty(doc, 'getSelection', {
      configurable: true,
      value: () => ({
        get rangeCount() {
          return selectedRange ? 1 : 0
        },
        get isCollapsed() {
          return selectedRange?.collapsed ?? true
        },
        getRangeAt: () => selectedRange!,
        removeAllRanges: () => {
          selectedRange = undefined
        },
      }),
    })
    doc.dispatchEvent(new Event('selectionchange'))
    expect(adapter.getSelection()?.quote).toBe('Alpha exact')

    // Opening a panel resizes the paginator, which relocates without the
    // reader touching the text. The selection must survive it.
    view.dispatchEvent(
      new CustomEvent('relocate', {
        detail: { ...view.lastLocation, cfi: 'fixture:0:0:0' },
      }),
    )
    expect(adapter.getSelection()?.quote).toBe('Alpha exact')

    await adapter.navigate({ kind: 'relative', direction: 'next' })
    expect(adapter.getSelection()).toBeNull()
  })

  it('announces in-book link and swipe intent before Foliate owns the move', async () => {
    const host = document.createElement('div')
    const onNavigationIntent = vi.fn()
    const adapter = makeAdapter(host, { onNavigationIntent })
    await adapter.open(new Blob(['fixture']))
    const view = host.querySelector('foliate-view') as unknown as FakeFoliateView

    view.dispatchEvent(new Event('link'))
    expect(onNavigationIntent).toHaveBeenCalledTimes(1)

    const doc = view.renderer.getContents()[0]!.doc
    const start = new Event('touchstart', { bubbles: true })
    Object.defineProperties(start, {
      changedTouches: { value: [{ clientX: 100, clientY: 20 }] },
      touches: { value: [{ clientX: 100, clientY: 20 }] },
      timeStamp: { value: 1 },
    })
    doc.dispatchEvent(start)
    const move = new Event('touchmove', { bubbles: true })
    Object.defineProperties(move, {
      changedTouches: { value: [{ clientX: 70, clientY: 20 }] },
      touches: { value: [{ clientX: 70, clientY: 20 }] },
      timeStamp: { value: 2 },
    })
    doc.dispatchEvent(move)
    expect(onNavigationIntent).toHaveBeenCalledTimes(2)
  })

  it('forwards keyboard activity from the EPUB frame to the host', async () => {
    const host = document.createElement('div')
    const onKeyboardActivity = vi.fn()
    const adapter = makeAdapter(host, { onKeyboardActivity })
    await adapter.open(new Blob(['fixture']))
    const view = host.querySelector('foliate-view') as unknown as FakeFoliateView

    view.renderer.getContents()[0]!.doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))

    expect(onKeyboardActivity).toHaveBeenCalledOnce()
  })

  it('keeps the verified tutor overlay in a namespace durable annotation rerenders cannot clear', async () => {
    const host = document.createElement('div')
    const drawTutor = vi.fn(() => document.createElementNS('http://www.w3.org/2000/svg', 'g'))
    const adapter = makeAdapter(host, { tutorOverlayRenderer: drawTutor })
    await adapter.open(new Blob(['fixture']))
    const view = host.querySelector('foliate-view') as unknown as FakeFoliateView
    const target = await adapter.getPassage({
      startCfi: 'fixture:0:0:0',
      endCfi: 'fixture:0:11:11',
      sectionIndex: 0,
      textFingerprint: 'ignored-until-resolved',
    }).catch(async () => adapter.getPassageAtLocation!({
      startCfi: 'fixture:0:0:0',
      endCfi: 'fixture:0:11:11',
      sectionIndex: 0,
      textFingerprint: 'ignored-until-resolved',
    }))

    adapter.setTutorTarget(target)
    await waitFor(() => expect(view.overlayAdd).toHaveBeenCalledWith(
      'bookhand-tutor-overlay',
      expect.any(Range),
      expect.any(Function),
      expect.any(Object),
    ))
    const draw = view.overlayAdd.mock.calls.at(-1)?.[2] as FoliateDrawFunction
    draw([], {})
    expect(drawTutor).toHaveBeenCalled()
    view.overlayRemove.mockClear()

    adapter.renderAnnotations([{ id: 'durable', cfi: 'fixture:0:0:11', color: '#c24a2b' }])
    adapter.renderAnnotations([{ id: 'durable', cfi: 'fixture:0:0:11', color: '#c24a2b' }])
    expect(view.overlayRemove).not.toHaveBeenCalledWith('bookhand-tutor-overlay')

    adapter.setTutorTarget(null)
    expect(view.overlayRemove).toHaveBeenCalledWith('bookhand-tutor-overlay')
  })

  it('composes production tutor cues instead of outlining every inline fragment', async () => {
    const host = document.createElement('div')
    const animate = vi.fn()
    const highlight = vi.fn(() => document.createElementNS('http://www.w3.org/2000/svg', 'g'))
    const underline = vi.fn(() => document.createElementNS('http://www.w3.org/2000/svg', 'g'))
    const outline = vi.fn(() => document.createElementNS('http://www.w3.org/2000/svg', 'g'))
    Object.defineProperty(SVGElement.prototype, 'animate', {
      configurable: true,
      value: animate,
    })
    let reducedMotion = false
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion') && reducedMotion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    document.body.append(host)
    const adapter = new FoliateReaderAdapter(host, {}, {
      loadFoliate: async () => ({
        makeBook: async () => makeBook(),
        Overlayer: { highlight, underline, outline },
      }),
    })
    await adapter.open(new Blob(['fixture']))
    const view = host.querySelector('foliate-view') as unknown as FakeFoliateView
    const target = await adapter.getPassageAtLocation!({
      startCfi: 'fixture:0:0:0',
      endCfi: 'fixture:0:11:11',
      sectionIndex: 0,
      textFingerprint: 'resolved-by-adapter',
    })

    adapter.setTutorTarget(target, { kind: 'outline' })
    await waitFor(() => expect(view.overlayAdd).toHaveBeenCalled())
    const call = view.overlayAdd.mock.calls.at(-1)
    expect(call?.[0]).toBe('bookhand-tutor-overlay')
    const draw = call?.[2] as ((rects: readonly DOMRect[], options?: Record<string, unknown>) => Element)
    const preciseRects = [
      new DOMRect(20, 30, 180, 20),
      new DOMRect(20, 52, 150, 20),
    ]
    // Browsers pass DOMRectList here, not an Array. Keep the test collection
    // iterable while deliberately withholding Array.prototype methods.
    const browserRects = {
      0: preciseRects[0],
      1: preciseRects[1],
      length: preciseRects.length,
      item: (index: number) => preciseRects[index] ?? null,
      *[Symbol.iterator]() { yield* preciseRects },
    } as unknown as readonly DOMRect[]
    const element = draw(browserRects, call?.[3] as Record<string, unknown>)
    expect(outline).not.toHaveBeenCalled()
    expect(highlight).not.toHaveBeenCalled()
    expect(underline).not.toHaveBeenCalled()
    expect(element).toHaveAttribute('data-bookhand-tutor-cue', 'outline')
    expect(element).toHaveAttribute('data-bookhand-tutor-scope', 'precise')
    expect(element.children).toHaveLength(1)
    expect(animate).toHaveBeenCalledWith(
      [{ opacity: 0.15 }, { opacity: 1 }],
      { duration: 520, easing: 'ease-out' },
    )

    reducedMotion = true
    adapter.setTutorTarget(target, { kind: 'outline' })
    await waitFor(() => expect(view.overlayAdd).toHaveBeenCalledTimes(2))
    const reducedMotionDraw = view.overlayAdd.mock.calls.at(-1)?.[2] as FoliateDrawFunction
    const broadRects = Array.from({ length: 16 }, (_, index) =>
      new DOMRect(index < 8 ? 20 : 700, 30 + (index % 8) * 22, 220, 20),
    )
    const broad = reducedMotionDraw(broadRects, call?.[3] as Record<string, unknown>)
    expect(broad).toHaveAttribute('data-bookhand-tutor-scope', 'broad')
    expect(broad.children).toHaveLength(2)
    expect(broad.children[1]).toHaveAttribute('x', '13')
    expect(animate).toHaveBeenCalledTimes(1)
    Reflect.deleteProperty(SVGElement.prototype, 'animate')
  })

  it('keeps one live viewer through the React StrictMode setup and cleanup cycle', async () => {
    const adapters: FoliateReaderAdapter[] = []
    const onReady = (adapter: unknown) => adapters.push(adapter as FoliateReaderAdapter)
    const close = vi.spyOn(FoliateReaderAdapter.prototype, 'close')
    const surface = render(
      createElement(
        StrictMode,
        null,
        createElement(ReaderHost, { onReady }),
      ),
    )

    expect(adapters.length).toBeGreaterThanOrEqual(1)
    expect(surface.container.querySelectorAll('[data-reader-host]')).toHaveLength(1)
    expect(close).toHaveBeenCalledTimes(adapters.length - 1)

    surface.unmount()
    expect(close).toHaveBeenCalledTimes(adapters.length)
  })

})

function makeAdapter(
  host: HTMLElement,
  options: ConstructorParameters<typeof FoliateReaderAdapter>[1] = {},
) {
  document.body.append(host)
  return new FoliateReaderAdapter(host, {
    ...options,
  }, { loadFoliate: async () => ({ makeBook: async () => makeBook() }) })
}

function makeBook(): FoliateBook {
  const documents = sectionMarkup.map(makeDocument)
  const book: FoliateBook = {
    metadata: {
      title: { en: 'Tiny Technical Book' },
      subtitle: 'A deterministic fixture',
      author: { name: 'Ada Reader', sortAs: 'Reader, Ada' },
      language: ['en'],
      publisher: { name: 'Bookhand Fixtures' },
      identifier: 'urn:bookhand:tiny',
    },
    toc: [
      {
        id: 1,
        label: 'Chapter one',
        href: 'chapter-1.xhtml',
        subitems: [{ id: 2, label: 'Nested destination', href: 'chapter-2.xhtml' }],
      },
    ],
    sections: documents.map((doc, index) => ({
      id: `chapter-${index + 1}.xhtml`,
      linear: 'yes',
      cfi: `fixture:${index}:0:0`,
      createDocument: async () => doc.cloneNode(true) as Document,
    })),
    transformTarget: new EventTarget(),
    getCover: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/svg+xml' }),
    resolveCFI(cfi) {
      const [, rawIndex, rawStart, rawEnd] = cfi.split(':')
      const index = Number(rawIndex)
      const start = Number(rawStart)
      const end = Number(rawEnd)
      return {
        index,
        anchor(doc: Document) {
          const text = doc.querySelector('p')!.firstChild!
          const range = doc.createRange()
          range.setStart(text, start)
          range.setEnd(text, end)
          return range
        },
      }
    },
    destroy: vi.fn(),
  }
  return book
}

function makeDocument(markup: string): Document {
  return new DOMParser().parseFromString(`<html><body>${markup}</body></html>`, 'text/html')
}

function containsDomValue(value: unknown): boolean {
  if (value instanceof Node || value instanceof Range || value instanceof Event) return true
  if (!value || typeof value !== 'object') return false
  return Object.values(value).some(containsDomValue)
}
