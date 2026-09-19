import type {
  BookMetadata,
  BookRange,
  ReaderAnnotationMark,
  BookSection,
  BookSectionSnapshot,
  BookTarget,
  Passage,
  ReaderAdapter,
  ReaderLocation,
  ReaderSelection,
  ReaderOpenOptions,
  ReaderStyle,
  TutorCue,
  TocItem,
} from '../domain/reader.ts'
import {
  BOOK_OPEN_DEADLINE_MS,
  DeadlineExceededError,
  READER_NAVIGATION_DEADLINE_MS,
  systemClock,
  withDeadline,
  type RuntimeClock,
} from '../runtime/deadlines.ts'
import {
  ReaderClosedError,
  ReaderNavigationError,
  ReaderNotOpenError,
  ReaderSectionLoadError,
} from './errors.ts'
import type {
  FoliateBook,
  FoliateDrawDetail,
  FoliateDrawFunction,
  FoliateModule,
  FoliateRelocation,
  FoliateResolvedTarget,
  FoliateTocItem,
  FoliateView,
} from './foliate-types.ts'
import { diagnoseSection, type SectionDiagnosis } from '../remaster/diagnose.ts'
import { remasterDocument } from '../remaster/document.ts'
import type {
  DocumentRemasterPort,
  RemasterReport,
  RemasterStore,
  RewriteSummary,
  SectionEditResult,
  SectionExactEdit,
} from '../domain/remaster.ts'
import type { SectionStylesheet } from '../remaster/rewrite.ts'
import {
  applyVersion,
  applyExactEdits,
  currentVersion,
  ExactEditError,
  fingerprintSectionSource,
  prepareRewrite,
  readSection,
  REMASTER_STYLE_ID,
  replaceBody,
  type RewriteResult,
  type SectionRewrite,
  type SectionSource,
  type SectionVersion,
} from '../remaster/rewrite.ts'
import { installSectionTransform } from '../remaster/section-transform.ts'
import { translateResources, type ResourceMap } from '../remaster/resources.ts'
import { boundCustomCss } from './custom-css.ts'
import { isInteractiveTarget, tapZone, type TapZone } from './tap-intent.ts'
import { localized, mapMetadata } from './metadata.ts'
import {
  extractDocumentText,
  fingerprintText,
  normalizeBookText,
  passageFromAnchoredRange,
  passageFromRange,
} from './text.ts'
import { buildSectionChunks } from './chunking.ts'
import { bookPalette, shellPalette } from './theme.ts'

export interface ReaderAdapterEvents {
  /** Return false to reject a retired relocation from the adapter snapshot. */
  readonly onLocationChange?: (location: ReaderLocation, navigationId?: number) => boolean | void
  readonly onSelectionChange?: (selection: ReaderSelection | null) => void
  readonly onSectionError?: (error: ReaderSectionLoadError) => void
  /** A drawn highlight was activated in the book. */
  readonly onAnnotationActivate?: (annotationId: string) => void
  /**
   * A deliberate tap landed on the book. The host decides what each zone
   * means, so the reading surface stays free of policy.
   */
  readonly onTap?: (zone: TapZone) => void
  /** Keyboard activity inside the EPUB frame should wake host reader chrome. */
  readonly onKeyboardActivity?: () => void
  /** Trusted learner input inside the EPUB frame, distinct from renderer-driven focus. */
  readonly onReaderInteraction?: () => void
  /** Fired before Foliate handles a swipe or an in-book link. */
  readonly onNavigationIntent?: () => void
  /** Routes in-book links through the same serialized learner navigation path. */
  readonly onNavigationRequest?: (target: BookTarget) => void
}

export interface ReaderFaultHooks {
  readonly beforeOpen?: (blob: Blob) => Promise<void>
  readonly beforeSectionLoad?: (sectionIndex: number) => Promise<void>
}

export interface FoliateReaderAdapterOptions extends ReaderAdapterEvents {
  readonly clock?: RuntimeClock
  readonly openDeadlineMs?: number
  readonly navigationDeadlineMs?: number
  readonly faults?: ReaderFaultHooks
  /** Optional test or embedding override; production uses Foliate's native painters. */
  readonly tutorOverlayRenderer?: FoliateDrawFunction
}

interface FoliateReaderDependencies {
  readonly loadFoliate: () => Promise<FoliateModule>
}

interface ActiveReader {
  readonly book: FoliateBook
  readonly view: FoliateView
  readonly cleanups: readonly (() => void)[]
  /**
   * Removing the section transform is book-scoped, not view-scoped: the
   * listener lives on `book.transformTarget` and has to survive the view being
   * replaced during a rebuild.
   */
  readonly transformCleanup?: () => void
}

export const DEFAULT_READER_STYLE: ReaderStyle = {
  fontSizePercent: 100,
  lineHeight: 1.55,
  measureCh: 68,
  paragraphSpacingEm: 0.75,
  theme: 'publisher',
  pageLayout: 'auto',
}

export class FoliateReaderAdapter implements ReaderAdapter {
  readonly #host: HTMLElement
  readonly #options: FoliateReaderAdapterOptions
  readonly #dependencies: FoliateReaderDependencies
  #active: ActiveReader | undefined
  #revision = 0
  #toc: readonly TocItem[] = []
  #sections: readonly BookSection[] = []
  #location: ReaderLocation | undefined
  #selection: ReaderSelection | null = null
  #style = DEFAULT_READER_STYLE
  #marks: readonly ReaderAnnotationMark[] = []
  #overlayer: FoliateModule['Overlayer']
  #disposedViews = new WeakSet<FoliateView>()
  #tutorTarget: Passage | undefined
  #tutorCue: TutorCue = { kind: 'highlight' }
  #tutorGeneration = 0
  #navigationQueue: Promise<void> = Promise.resolve()
  #activeNavigation: {
    readonly operationId: number
    readonly id?: number
    readonly learnerEpoch: number
    readonly relative: boolean
  } | undefined
  #pendingNavigationRelocation: {
    readonly operationId: number
    readonly location: ReaderLocation
    readonly navigationId?: number
  } | undefined
  #navigationSequence = 0
  #learnerIntentEpoch = 0
  readonly #relocationProvenance: {
    readonly issued: boolean
    readonly navigationId?: number
  }[] = []
  #suppressRelocations = 0
  /**
   * Rewrites an agent has made, by section index.
   *
   * Nothing is rewritten until something asks. Each entry keeps the
   * publisher's own markup beside the agent's, so undo and reset always have
   * somewhere to go — and so a section the reader leaves and returns to comes
   * back as they left it. Foliate serves sections from its own blob-URL cache,
   * which knows nothing about any of this.
   */
  #rewrites = new Map<number, SectionRewrite>()
  #showRewritten = true
  /** Revisions saved by an agent which await an explicit human reveal. */
  #pendingRewriteSections = new Set<number>()
  /** Stable package-relative to mounted-resource URLs for each loaded section. */
  #sectionResourceMaps = new Map<number, ResourceMap>()
  #remasterMutations: Promise<void> = Promise.resolve()
  /** Which book is open, and where its rewrites are kept between sessions. */
  #bookId: string | undefined
  #rewriteStore: RemasterStore | undefined

  constructor(
    host: HTMLElement,
    options: FoliateReaderAdapterOptions = {},
    dependencies: FoliateReaderDependencies = { loadFoliate },
  ) {
    this.#host = host
    this.#options = options
    this.#dependencies = dependencies
  }

  async open(blob: Blob, options: ReaderOpenOptions = {}): Promise<BookMetadata> {
    const revision = ++this.#revision
    this.#destroyActive()
    this.#resetSnapshots()
    this.#bookId = options.bookId
    this.#rewriteStore = options.rewrites

    const operation = this.#openAtRevision(blob, revision)
    try {
      return await withDeadline(
        operation,
        this.#options.openDeadlineMs ?? BOOK_OPEN_DEADLINE_MS,
        this.#options.clock ?? systemClock,
      )
    } catch (error) {
      if (revision === this.#revision) {
        this.#revision += 1
        this.#destroyActive()
        this.#resetSnapshots()
        this.#bookId = undefined
        this.#rewriteStore = undefined
      }
      throw error
    }
  }

  async close(): Promise<void> {
    this.#revision += 1
    this.#destroyActive()
    this.#resetSnapshots()
    this.#bookId = undefined
    this.#rewriteStore = undefined
  }

  getToc(): readonly TocItem[] {
    return this.#toc
  }

  getLocation(): ReaderLocation {
    if (!this.#location) throw new ReaderNotOpenError()
    return this.#location
  }

  getSelection(): ReaderSelection | null {
    return this.#selection
  }

  async getVisibleContext(): Promise<Passage> {
    const { view } = this.#requireActive()
    const content = view.renderer.getContents()[0]
    if (!content) throw new ReaderNotOpenError()
    const visibleRange = view.lastLocation?.range
    if (visibleRange) {
      const visible = passageFromRange(
        visibleRange,
        content.index,
        this.#chapterBreadcrumb(content.index),
        (range) => view.getCFI(content.index, range),
      )
      if (normalizeBookText(visible.text)) return visible
    }
    const snapshot = await this.getSectionSnapshot(content.index)
    return {
      text: snapshot.text,
      range: {
        startCfi: snapshot.startCfi ?? view.getCFI(content.index),
        endCfi: snapshot.endCfi ?? view.getCFI(content.index),
        sectionIndex: content.index,
        textFingerprint: fingerprintText(snapshot.text),
      },
      chapterBreadcrumb: snapshot.chapterBreadcrumb,
    }
  }

  async getPassage(range: BookRange): Promise<Passage> {
    const passage = await this.getPassageAtLocation(range)
    if (passage.range.textFingerprint !== range.textFingerprint) {
      throw new Error(
        `Passage fingerprint mismatch: expected ${range.textFingerprint}, received ${passage.range.textFingerprint}`,
      )
    }
    return passage
  }

  async getPassageAtLocation(range: BookRange): Promise<Passage> {
    const { book, view } = this.#requireActive()
    const document = await this.#createSectionDocument(range.sectionIndex, 'displayed')
    const start = this.#resolveCfi(book, range.startCfi, document, range.sectionIndex)
    const end = this.#resolveCfi(book, range.endCfi, document, range.sectionIndex)
    const resolved = document.createRange()
    resolved.setStart(start.startContainer, start.startOffset)
    resolved.setEnd(end.endContainer, end.endOffset)
    return passageFromAnchoredRange(
      resolved,
      range.sectionIndex,
      this.#chapterBreadcrumb(range.sectionIndex),
      (value) => view.getCFI(range.sectionIndex, value),
    )
  }

  listSections(): readonly BookSection[] {
    return this.#sections
  }

  async getSectionSnapshot(sectionIndex: number): Promise<BookSectionSnapshot> {
    const { view } = this.#requireActive()
    const document = await this.#createSectionDocument(sectionIndex, 'displayed')
    const text = extractDocumentText(document)
    const body = document.body ?? document.documentElement
    const range = document.createRange()
    range.selectNodeContents(body)
    const start = range.cloneRange()
    start.collapse(true)
    const end = range.cloneRange()
    end.collapse(false)
    return {
      sectionIndex,
      text,
      chapterBreadcrumb: this.#chapterBreadcrumb(sectionIndex),
      startCfi: view.getCFI(sectionIndex, start),
      endCfi: view.getCFI(sectionIndex, end),
    }
  }

  async getSectionChunks(sectionIndex: number) {
    const { book, view } = this.#requireActive()
    const document = await this.#createSectionDocument(sectionIndex)
    const title = this.#sectionLabel(sectionIndex) ?? `Section ${sectionIndex + 1}`
    const chunks = buildSectionChunks(
      document,
      sectionIndex,
      title,
      (range) => view.getCFI(sectionIndex, range),
    )
    // Do not persist an anchor merely because Foliate emitted it. Resolve it
    // through a fresh section document and retain only exact round trips. A
    // terminal semantic object can have useful alternative text but no stable
    // text endpoint after it (Flatland's final image is one real example).
    // Equal collapsed endpoints cannot cite its non-empty text; omit only that
    // known-unresolvable shape so every other mismatch still fails visibly.
    const stable: (typeof chunks)[number][] = []
    const validationDocument = await this.#createSectionDocument(sectionIndex)
    for (const [index, chunk] of chunks.entries()) {
      if (chunk.range.startCfi === chunk.range.endCfi) {
        if (index === chunks.length - 1) continue
        throw new Error(`Section ${sectionIndex + 1} produced an unstable search anchor.`)
      }
      const start = this.#resolveCfi(book, chunk.range.startCfi, validationDocument, sectionIndex)
      const end = this.#resolveCfi(book, chunk.range.endCfi, validationDocument, sectionIndex)
      const range = validationDocument.createRange()
      range.setStart(start.startContainer, start.startOffset)
      range.setEnd(end.endContainer, end.endOffset)
      const resolved = passageFromAnchoredRange(
        range,
        sectionIndex,
        this.#chapterBreadcrumb(sectionIndex),
        (value) => view.getCFI(sectionIndex, value),
      )
      if (
        resolved.range.textFingerprint === chunk.range.textFingerprint &&
        resolved.text.includes(chunk.text)
      ) {
        stable.push(chunk)
      } else {
        throw new Error(`Section ${sectionIndex + 1} produced an unstable search anchor.`)
      }
    }
    return stable
  }

  async navigate(target: BookTarget, navigationId?: number): Promise<void> {
    const revision = this.#revision
    const operation = this.#navigationQueue.then(async () => {
      if (revision !== this.#revision) throw new ReaderClosedError()
      const active = this.#requireActive()
      const operationId = ++this.#navigationSequence
      this.#clearSelection()
      this.#activeNavigation = {
        operationId,
        ...(navigationId === undefined ? {} : { id: navigationId }),
        learnerEpoch: this.#learnerIntentEpoch,
        relative: target.kind === 'relative',
      }
      try {
        await withDeadline(
          this.#navigateActive(active, target),
          this.#options.navigationDeadlineMs ?? READER_NAVIGATION_DEADLINE_MS,
          this.#options.clock ?? systemClock,
        )
        this.#commitNavigationRelocation(operationId)
      } catch (error) {
        this.#discardNavigationRelocation(operationId)
        console.error('[Bookhand reader] Navigation failed.', {
          stage: error instanceof DeadlineExceededError ? 'section-render-timeout' : 'section-render',
          target,
          error,
        })
        if (error instanceof DeadlineExceededError) {
          if (this.#activeNavigation?.operationId === operationId) {
            this.#activeNavigation = undefined
          }
          try {
            await this.#recoverStalledView(active, revision)
          } catch (recoveryError) {
            console.error('[Bookhand reader] Navigation recovery failed.', {
              stage: 'replacement-reader-init',
              target,
              error: recoveryError,
            })
          }
        }
        if (error instanceof ReaderSectionLoadError || error instanceof ReaderNavigationError) throw error
        throw new ReaderNavigationError(target, error)
      } finally {
        if (this.#activeNavigation?.operationId === operationId) {
          this.#activeNavigation = undefined
        }
      }
    })
    this.#navigationQueue = operation.catch(() => undefined)
    return operation
  }

  async #navigateActive(active: ActiveReader, target: BookTarget): Promise<void> {
    if (target.kind === 'relative') {
      const turn = () => target.direction === 'previous'
        ? active.view.renderer.prev()
        : active.view.renderer.next()
      if (crossesSectionBoundary(active.view, target.direction)) {
        await animateSectionBoundaryTurn(active.view, target.direction, turn)
      } else {
        await turn()
      }
      return
    }

    const navigationTarget =
      target.kind === 'section' ? target.sectionIndex : target.kind === 'cfi' ? target.cfi : target.href
    const resolved = active.view.resolveNavigation(navigationTarget)
    if (!resolved || !this.#isValidSection(resolved.index)) {
      throw new ReaderNavigationError(target)
    }
    await this.#loadResolvedTarget(active, resolved)
    active.view.history.pushState(navigationTarget)
  }

  applyStyle(style: ReaderStyle): void {
    this.#style = structuredClone(style)
    const view = this.#active?.view
    view?.renderer.setStyles?.(makeReaderCss(this.#style))
    if (view) applyPageLayout(view, this.#style.pageLayout ?? 'auto')
  }

  getStyle(): ReaderStyle {
    return structuredClone(this.#style)
  }

  resetStyle(): void {
    this.applyStyle(DEFAULT_READER_STYLE)
  }

  /**
   * Draws stored highlights over the book. Marks whose CFI no longer resolves
   * are skipped rather than throwing: a book that changed underneath an
   * annotation should still be readable.
   */
  renderAnnotations(marks: readonly ReaderAnnotationMark[]): void {
    const previous = this.#marks
    this.#marks = marks
    const view = this.#active?.view
    if (!view?.addAnnotation) return

    const kept = new Set(marks.map((mark) => mark.cfi))
    for (const stale of previous) {
      if (!kept.has(stale.cfi)) void view.deleteAnnotation?.({ value: stale.cfi })?.catch?.(noop)
    }
    for (const mark of marks) {
      void view.addAnnotation({ value: mark.cfi, color: mark.color })?.catch?.(noop)
    }
  }

  setTutorTarget(passage: Passage | null, cue: TutorCue = { kind: 'highlight' }): void {
    this.#tutorGeneration += 1
    this.#clearTutorOverlay()
    this.#tutorTarget = passage ? structuredClone(passage) : undefined
    this.#tutorCue = cue
    if (passage) void this.#renderTutorOverlay(this.#tutorGeneration)
  }

  async #openAtRevision(blob: Blob, revision: number): Promise<BookMetadata> {
    await this.#options.faults?.beforeOpen?.(blob)
    this.#assertCurrent(revision)
    const module = await this.#dependencies.loadFoliate()
    this.#overlayer = module.Overlayer
    this.#assertCurrent(revision)
    const file =
      blob instanceof File
        ? blob
        : new File([blob], 'book.epub', { type: blob.type || 'application/epub+zip' })
    const book = await module.makeBook(file)
    if (revision !== this.#revision) {
      book.destroy?.()
      throw new ReaderClosedError()
    }

    blockPackagedScripts(book)
    // Saved rewrites are loaded before the view opens, so the first thing
    // Foliate parses is already the version the reader last saw. Hydrating
    // after the first render would show the publisher's markup and then
    // replace it, which reads as the app changing its mind.
    await this.#hydrateRewrites(revision)
    // Rewrites are served here, before Foliate parses or paginates a section.
    const uninstallTransform = installSectionTransform(
      book,
      (sectionIndex) =>
        this.#showRewritten
          ? currentVersion(this.#rewrites.get(sectionIndex) ?? emptyRewrite)
          : undefined,
      (sectionIndex, resources) => this.#sectionResourceMaps.set(sectionIndex, resources),
    )
    const view = document.createElement('foliate-view') as FoliateView
    // Foliate's defaults are desktop-shaped: 48px of margin top and bottom,
    // and no page-turn animation at all. On a phone that spent 96px of a 839px
    // screen on nothing, and made every turn snap without transition, which
    // reads as unresponsive rather than fast.
    const cleanups = [...this.#listen(view)]
    this.#active = { book, view, cleanups, transformCleanup: uninstallTransform }
    this.#host.replaceChildren(view)
    try {
      await view.open(book)
      this.#assertCurrent(revision)
      cleanups.push(configureForViewport(view, () => this.#style.pageLayout ?? 'auto'))
      cleanups.push(this.#listenForRendererRelocations(view))
      this.#toc = mapToc(book.toc ?? [])
      this.#sections = mapSections(book.sections, this.#toc)
      view.renderer.setStyles?.(makeReaderCss(this.#style))
      await view.init({ showTextStart: true })
      this.#assertCurrent(revision)
      this.#captureRelocation(view.lastLocation)
      return await mapMetadata(book)
    } catch (error) {
      if (revision === this.#revision) this.#destroyActive()
      else this.#dispose({ book, view, cleanups })
      throw error
    }
  }

  #listen(view: FoliateView): readonly (() => void)[] {
    const sectionCleanups: (() => void)[] = []
    const onRelocate = (event: Event) => {
      // Relocation is not deselection. The paginator relocates whenever its box
      // changes, so clearing here would drop the reader's selection every time
      // a panel opened. Genuine deselection arrives through `selectionchange`,
      // and deliberate navigation clears the selection itself.
      this.#captureRelocation((event as CustomEvent<FoliateRelocation>).detail)
    }
    const onLoad = (event: Event) => {
      while (sectionCleanups.length) sectionCleanups.pop()?.()
      const detail = (event as CustomEvent<{ doc: Document; index: number }>).detail
      // The document that arrives here has already been through the section
      // transform, so it is whatever the reader asked to see. Nothing is
      // rewritten at this point; the publisher's own markup is only recorded
      // the first time, while it is still the only thing there is.
      const onSelectionChange = () => this.#captureSelection(view, detail.doc, detail.index)
      detail.doc.addEventListener('selectionchange', onSelectionChange)
      sectionCleanups.push(() =>
        detail.doc.removeEventListener('selectionchange', onSelectionChange),
      )
      // Taps have to be caught inside the section document: Foliate binds its
      // own touch handling there, and events in the book's iframe never reach
      // the host element.
      sectionCleanups.push(...this.#listenForTaps(detail.doc))
    }
    const onDrawAnnotation = (event: Event) => {
      const detail = (event as CustomEvent<FoliateDrawDetail>).detail
      const overlayer = this.#overlayer
      if (!overlayer) return
      detail.draw(overlayer.highlight, { color: detail.annotation.color ?? 'currentColor' })
    }
    const onShowAnnotation = (event: Event) => {
      const value = (event as CustomEvent<{ value: string }>).detail.value
      const mark = this.#marks.find((candidate) => candidate.cfi === value)
      if (mark) this.#options.onAnnotationActivate?.(mark.id)
    }
    // A newly rendered section has a fresh overlay, so stored marks are drawn
    // again rather than only existing on the section that was open when saved.
    const onCreateOverlay = () => {
      this.renderAnnotations(this.#marks)
      const generation = this.#tutorGeneration
      queueMicrotask(() => void this.#renderTutorOverlay(generation))
    }
    const onLink = (event: Event) => {
      const href = (event as CustomEvent<{ href?: string }>).detail?.href
      if (href && this.#options.onNavigationRequest) {
        event.preventDefault()
        this.#learnerIntentEpoch += 1
        this.#options.onNavigationRequest({ kind: 'href', href })
        return
      }
      this.#learnerIntentEpoch += 1
      this.#options.onNavigationIntent?.()
    }

    view.addEventListener('relocate', onRelocate)
    view.addEventListener('load', onLoad)
    view.addEventListener('draw-annotation', onDrawAnnotation)
    view.addEventListener('show-annotation', onShowAnnotation)
    view.addEventListener('create-overlay', onCreateOverlay)
    view.addEventListener('link', onLink)
    return [
      () => view.removeEventListener('relocate', onRelocate),
      () => view.removeEventListener('load', onLoad),
      () => view.removeEventListener('draw-annotation', onDrawAnnotation),
      () => view.removeEventListener('show-annotation', onShowAnnotation),
      () => view.removeEventListener('create-overlay', onCreateOverlay),
      () => view.removeEventListener('link', onLink),
      () => {
        while (sectionCleanups.length) sectionCleanups.pop()?.()
      },
    ]
  }

  /**
   * Turn touch activity in one section document into tap intent.
   *
   * Taps have to be caught here, in capture phase, for two reasons. Events in
   * the book's iframe never reach the host element, so this is the only place
   * they exist. And Foliate's own `touchend` handler on this same document
   * calls `snap(0, 0)`, which resolves to the current page and then — because
   * that page is page 0 or the last page — navigates to the adjacent section.
   * So on a phone, *any* tap taken while on a section's first page jumps
   * backwards a whole section. Capture on the document runs before the target,
   * and therefore before Foliate's own listener bubbles back, which is what
   * lets a recognized tap stop it.
   *
   * Only a recognized tap is stopped. Everything else — swipes, presses,
   * selection, a tap on a link — is left exactly as Foliate had it.
   */
  #listenForTaps(doc: Document): readonly (() => void)[] {
    let start: { x: number; y: number; at: number; hadSelection: boolean } | undefined
    let swipeAnnounced = false

    const onStart = (event: TouchEvent) => {
      const touch = event.changedTouches[0]
      const selection = doc.getSelection()
      start =
        event.touches.length > 1 || !touch
          ? undefined
          : {
              x: touch.clientX,
              y: touch.clientY,
              at: event.timeStamp,
              hadSelection: Boolean(selection && !selection.isCollapsed),
            }
      swipeAnnounced = false
    }

    const onMove = (event: TouchEvent) => {
      const touch = event.changedTouches[0]
      if (!start || !touch || swipeAnnounced) return
      if (Math.abs(touch.clientX - start.x) < 12) return
      swipeAnnounced = true
      this.#learnerIntentEpoch += 1
      this.#options.onNavigationIntent?.()
    }

    const onEnd = (event: TouchEvent) => {
      const began = start
      start = undefined
      swipeAnnounced = false
      const touch = event.changedTouches[0]
      if (!began || !touch || isInteractiveTarget(event.target)) return
      const zone = tapZone(began, {
        x: touch.clientX,
        y: touch.clientY,
        at: event.timeStamp,
        fraction: this.#hostFraction(doc, touch.clientX),
      })
      if (!zone) return
      event.stopPropagation()
      event.stopImmediatePropagation()
      this.#options.onTap?.(zone)
    }

    const onCancel = () => {
      start = undefined
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.isTrusted) this.#options.onReaderInteraction?.()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isTrusted) this.#options.onReaderInteraction?.()
      this.#options.onKeyboardActivity?.()
    }

    doc.addEventListener('pointerdown', onPointerDown, { capture: true })
    doc.addEventListener('touchstart', onStart, { capture: true, passive: true })
    doc.addEventListener('touchend', onEnd, { capture: true })
    doc.addEventListener('touchmove', onMove, { capture: true, passive: true })
    doc.addEventListener('touchcancel', onCancel, { capture: true, passive: true })
    doc.addEventListener('keydown', onKeyDown, { capture: true })
    return [
      () => doc.removeEventListener('pointerdown', onPointerDown, { capture: true }),
      () => doc.removeEventListener('touchstart', onStart, { capture: true }),
      () => doc.removeEventListener('touchend', onEnd, { capture: true }),
      () => doc.removeEventListener('touchmove', onMove, { capture: true }),
      () => doc.removeEventListener('touchcancel', onCancel, { capture: true }),
      () => doc.removeEventListener('keydown', onKeyDown, { capture: true }),
    ]
  }

  /**
   * Where a touch landed along the visible book, as a fraction of the host's
   * width.
   *
   * The section document's own coordinates are useless for this: Foliate lays
   * the whole section out as one very wide multi-column canvas and slides it,
   * so a touch on the middle of the fourth page reports a `clientX` of several
   * thousand. Adding the frame's position in this document converts back to
   * where the finger actually was on screen.
   */
  #hostFraction(doc: Document, clientX: number): number {
    const frame = doc.defaultView?.frameElement
    const host = this.#host.getBoundingClientRect()
    if (!frame || host.width <= 0) return Number.NaN
    const onScreen = frame.getBoundingClientRect().left + clientX
    return (onScreen - host.left) / host.width
  }

  #captureRelocation(detail?: FoliateRelocation): void {
    if (!detail?.cfi) return
    if (this.#suppressRelocations > 0) return
    const sectionIndex = detail.section?.current ?? this.#active?.view.renderer.getContents()[0]?.index ?? 0
    const location: ReaderLocation = {
      cfi: detail.cfi,
      sectionIndex,
      fraction: Number.isFinite(detail.fraction)
        ? Math.min(1, Math.max(0, detail.fraction ?? 0))
        : 0,
      chapterLabel: localized(detail.tocItem?.label) || this.#sectionLabel(sectionIndex),
      textFingerprint: detail.range ? fingerprintText(detail.range.toString()) : undefined,
    }
    const provenance = this.#relocationProvenance.shift()
    const navigationId = provenance?.navigationId
    const activeNavigation = this.#activeNavigation
    if (activeNavigation && provenance?.issued) {
      this.#pendingNavigationRelocation = {
        operationId: activeNavigation.operationId,
        location,
        ...(navigationId === undefined ? {} : { navigationId }),
      }
      return
    }
    const accepted = this.#options.onLocationChange?.(structuredClone(location), navigationId)
    if (accepted !== false) this.#location = location
  }

  #commitNavigationRelocation(operationId: number): void {
    const pending = this.#pendingNavigationRelocation
    if (!pending || pending.operationId !== operationId) return
    this.#pendingNavigationRelocation = undefined
    const accepted = this.#options.onLocationChange?.(
      structuredClone(pending.location),
      pending.navigationId,
    )
    if (accepted !== false) this.#location = pending.location
  }

  #discardNavigationRelocation(operationId: number): void {
    if (this.#pendingNavigationRelocation?.operationId === operationId) {
      this.#pendingNavigationRelocation = undefined
    }
  }

  #listenForRendererRelocations(view: FoliateView): () => void {
    const onRelocate = (event: Event) => {
      // Capture phase runs before Foliate converts the renderer event into the
      // public view relocation. Because adapter navigation is serialized,
      // this is exact provenance rather than a guess based on visible geometry.
      const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason
      const active = this.#activeNavigation
      const unchangedLearnerEpoch = active?.learnerEpoch === this.#learnerIntentEpoch
      const issuedRelocation =
        active &&
        (reason === 'navigation' ||
          (unchangedLearnerEpoch && reason == null) ||
          (active.relative && unchangedLearnerEpoch && reason === 'page'))
      this.#relocationProvenance.push(
        issuedRelocation
          ? {
              issued: true,
              ...(active.id === undefined ? {} : { navigationId: active.id }),
            }
          : { issued: false },
      )
    }
    view.renderer.addEventListener('relocate', onRelocate, { capture: true })
    return () => view.renderer.removeEventListener('relocate', onRelocate, { capture: true })
  }

  #captureSelection(view: FoliateView, document: Document, sectionIndex: number): void {
    const selection = document.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed) {
      this.#clearSelection()
      return
    }
    const range = selection.getRangeAt(0)
    const passage = passageFromRange(
      range,
      sectionIndex,
      this.#chapterBreadcrumb(sectionIndex),
      (value) => view.getCFI(sectionIndex, value),
    )
    if (!passage.text) {
      this.#clearSelection()
      return
    }
    this.#selection = { quote: passage.text, range: passage.range }
    this.#options.onSelectionChange?.(structuredClone(this.#selection))
  }

  async #renderTutorOverlay(generation: number): Promise<void> {
    const target = this.#tutorTarget
    const active = this.#active
    const cueKind = this.#tutorCue.kind
    const painter = this.#options.tutorOverlayRenderer ?? this.#overlayer?.[cueKind]
    if (!painter || !target || !active || generation !== this.#tutorGeneration) return
    const content = active.view.renderer
      .getContents()
      .find((candidate) => candidate.index === target.range.sectionIndex)
    if (!content?.overlayer) return
    try {
      const start = this.#resolveCfi(active.book, target.range.startCfi, content.doc, target.range.sectionIndex)
      const end = this.#resolveCfi(active.book, target.range.endCfi, content.doc, target.range.sectionIndex)
      const range = content.doc.createRange()
      range.setStart(start.startContainer, start.startOffset)
      range.setEnd(end.endContainer, end.endOffset)
      // These endpoints are the already-stabilized CFIs minted by Bookhand.
      // Re-running the selection-oriented semantic anchoring here can widen
      // them to a surrounding figure or paragraph, making the safety check
      // disagree with the passage that was verified moments earlier and
      // silently suppressing the cue.
      const resolved = passageFromAnchoredRange(
        range,
        target.range.sectionIndex,
        target.chapterBreadcrumb,
        (value) => active.view.getCFI(target.range.sectionIndex, value),
      )
      if (
        generation !== this.#tutorGeneration ||
        this.#active !== active ||
        normalizeBookText(resolved.text) !== normalizeBookText(target.text)
      ) return
      const renderer: FoliateDrawFunction = (rects, options) => {
        const element = this.#options.tutorOverlayRenderer
          ? painter(rects, options)
          : drawTutorCue(rects, { ...options, kind: cueKind })
        element.setAttribute('data-bookhand-tutor-cue', cueKind)
        const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        if (!reducedMotion && 'animate' in element) {
          element.animate(
            [{ opacity: 0.15 }, { opacity: 1 }],
            { duration: 520, easing: 'ease-out' },
          )
        }
        return element
      }
      content.overlayer.add('bookhand-tutor-overlay', range, renderer, {
        color: shellPalette(this.#style.theme).accent,
        width: 2,
        radius: 3,
        writingMode: content.doc.documentElement.computedStyleMap?.().get('writing-mode')?.toString()
          ?? 'horizontal-tb',
      })
    } catch {
      // A transient teaching cue must never make the book unreadable.
    }
  }

  #clearTutorOverlay(): void {
    for (const content of this.#active?.view.renderer.getContents() ?? []) {
      content.overlayer?.remove('bookhand-tutor-overlay')
    }
  }

  /**
   * The remastering surface. The adapter is its own port: these are reader
   * capabilities, not a separate subsystem bolted beside one.
   */
  get remaster(): DocumentRemasterPort {
    return this
  }

  /**
   * Report what a section's markup contains, without judging it.
   *
   * Facts only: how many blocks, headings and images there are, what each
   * image carries, and what the block structure is under its class names.
   * Classifying an image as an equation, or a bold paragraph as a heading, is
   * the agent's call — so this does not pre-empt it with heuristics that would
   * be wrong on the next book.
   */
  async diagnoseSection(sectionIndex: number): Promise<SectionDiagnosis> {
    return diagnoseSection(await this.#currentSourceDocument(sectionIndex), sectionIndex)
  }

  /**
   * The section as it stands: the agent's current version if there is one, and
   * the publisher's own document otherwise.
   *
   * Reading or diagnosing the publisher's document after a rewrite would show
   * an agent the chapter it already replaced, so its second pass would be
   * working from markup that is no longer on screen. Everything here stays in
   * package-relative terms, which is what makes a version persistable.
   */
  async #currentSourceDocument(sectionIndex: number): Promise<Document> {
    const create = this.#sectionSource(sectionIndex)
    const document_ = await create()
    const version = this.#currentVersion(sectionIndex)
    if (version) applyVersion(document_, version)
    return document_
  }

  /**
   * Hand an agent the section's real source.
   *
   * This is the packaged XHTML, read through `createDocument()`, with `src`
   * and `href` still package-relative — not the rendered DOM. The rendered DOM
   * carries `blob:` URLs that exist only for this page load, so a rewrite
   * built from it would be meaningless after a reload and could never be
   * exported as an EPUB. Stylesheets come back by packaged name rather than
   * concatenated, so an agent can say which sheet it means.
   */
  async getSectionSource(sectionIndex: number): Promise<SectionSource> {
    const { book } = this.#requireActive()
    const document_ = await this.#currentSourceDocument(sectionIndex)
    const label = this.#sectionLabel(sectionIndex)
    const version = this.#currentVersion(sectionIndex)
    const stylesheets = await this.#readStylesheets(book, sectionIndex, document_)
    const html = (document_.body ?? document_.documentElement)?.innerHTML ?? ''
    return readSection(document_, sectionIndex, {
      ...(label === undefined ? {} : { label }),
      rewritten: this.#rewrites.has(sectionIndex),
      revision: this.#rewrites.get(sectionIndex)?.versions.length ?? 0,
      sourceFingerprint: fingerprintSectionSource({
        ...(this.#bookId === undefined ? {} : { bookId: this.#bookId }),
        sectionIndex,
        html,
        ...(version?.css === undefined ? {} : { css: version.css }),
      }),
      // The agent's own stylesheet comes back too, so a second pass edits what
      // it wrote rather than starting from a sheet it cannot see.
      stylesheets: version?.css
        ? [...stylesheets, { name: 'bookhand-remaster', css: version.css }]
        : stylesheets,
    })
  }

  /** A section's stylesheets, inline and linked, as the package holds them. */
  async #readStylesheets(
    book: FoliateBook,
    sectionIndex: number,
    document_: Document,
  ): Promise<readonly SectionStylesheet[]> {
    const sheets: SectionStylesheet[] = []
    document_.querySelectorAll('style').forEach((style, index) => {
      // The agent's own sheet is reported under its own name, not as one of
      // the publisher's inline blocks.
      if (style.id === REMASTER_STYLE_ID) return
      const css = style.textContent ?? ''
      if (css.trim()) sheets.push({ name: `inline-${index}`, css })
    })
    const section = book.sections[sectionIndex]
    for (const link of document_.querySelectorAll('link[rel~="stylesheet"][href]')) {
      const href = link.getAttribute('href')
      if (!href) continue
      const path = section?.resolveHref?.(href) ?? href
      try {
        const css = await book.loadText?.(path)
        if (typeof css === 'string') sheets.push({ name: path, css })
      } catch {
        // A stylesheet that will not load is one the agent simply does not get.
      }
    }
    return sheets
  }

  /**
   * Replace a section's markup, and optionally its stylesheet, with an agent's.
   *
   * The agent decides what the document should be. Bookhand archives the
   * publisher's version first, sanitizes what comes back, and reports what the
   * sanitizer refused — so a proposal that was partly rejected is visible
   * rather than silently thinned.
   */
  async rewriteSection(
    sectionIndex: number,
    html: string,
    options: { readonly css?: string; readonly summary?: string; readonly deferDisplay?: boolean } = {},
  ): Promise<RewriteResult> {
    return this.#mutateRemaster(() => this.#rewriteSectionNow(sectionIndex, html, options))
  }

  async #rewriteSectionNow(
    sectionIndex: number,
    html: string,
    options: { readonly css?: string; readonly summary?: string; readonly deferDisplay?: boolean },
    previousHtml?: string,
  ): Promise<RewriteResult> {
    const beforeHtml = previousHtml ?? (await this.getSectionSource(sectionIndex)).html
    const before = {
      elements: countElements(beforeHtml),
      bytes: beforeHtml.length,
    }
    const prepared = prepareRewrite({
      html,
      ...(options.css === undefined ? {} : { css: options.css }),
      ...(options.summary === undefined ? {} : { summary: options.summary }),
    })
    const displayed = await this.#commit(sectionIndex, prepared.version, options.deferDisplay)
    return {
      sectionIndex,
      applied: true,
      displayed,
      sanitized: prepared.sanitized,
      cssModified: prepared.cssModified,
      before,
      after: { elements: countElements(prepared.version.html), bytes: prepared.version.html.length },
    }
  }

  /**
   * Apply a coding-agent style patch to the exact source it just read.
   *
   * Matching happens before sanitization or persistence, so a stale,
   * missing, or ambiguous edit cannot leave half a batch in the book. The
   * resulting complete document deliberately goes through rewriteSection:
   * there is one security boundary, one revision mechanism, and one refresh.
   */
  async editSection(
    sectionIndex: number,
    sourceFingerprint: string,
    edits: readonly SectionExactEdit[],
    options: { readonly css?: string; readonly summary?: string; readonly deferDisplay?: boolean } = {},
  ): Promise<SectionEditResult> {
    return this.#mutateRemaster(async () => {
      const source = await this.getSectionSource(sectionIndex)
      if (source.sourceFingerprint !== sourceFingerprint) {
        throw new ExactEditError(
          'The section changed after you read it. Read get_section_source again and rebuild the edit from that source.',
        )
      }
      const html = applyExactEdits(source.html, edits)
      const existingCss = this.#currentVersion(sectionIndex)?.css
      const result = await this.#rewriteSectionNow(
        sectionIndex,
        html,
        {
          ...(options.css === undefined
            ? existingCss === undefined ? {} : { css: existingCss }
            : { css: options.css }),
          ...(options.summary === undefined ? {} : { summary: options.summary }),
          ...(options.deferDisplay === undefined ? {} : { deferDisplay: options.deferDisplay }),
        },
        source.html,
      )
      return { ...result, editsApplied: edits.length }
    })
  }

  /**
   * The deterministic bulk repair, offered as a tool rather than imposed.
   *
   * A TeX-derived EPUB carries its own LaTeX in `data-tex`, and compiling that
   * to MathML is mechanical — chapter III of the bundled book has 161 of them.
   * An agent can call this instead of rewriting several hundred images by
   * hand, then edit the result like any other markup. It is a power tool the
   * agent chooses, never something that happens to a book on its own.
   */
  async compileSectionMath(
    sectionIndex: number,
    options: { readonly deferDisplay?: boolean } = {},
  ): Promise<RemasterReport> {
    return this.#mutateRemaster(() => this.#compileSectionMathNow(sectionIndex, options.deferDisplay))
  }

  async #compileSectionMathNow(
    sectionIndex: number,
    deferDisplay?: boolean,
  ): Promise<RemasterReport> {
    // From the section's *source*, never the rendered DOM. The rendered copy
    // has had its references replaced with `blob:` URLs that die with the page,
    // so compiling from it would store a version that cannot survive a reload
    // or ever be exported — and would take every figure in the chapter with it.
    const working = await this.#currentSourceDocument(sectionIndex)
    const report = remasterDocument(working, { idPrefix: `s${sectionIndex}` })
    const existing = this.#currentVersion(sectionIndex)
    await this.#commit(sectionIndex, {
      html: working.body.innerHTML,
      ...(existing?.css === undefined ? {} : { css: existing.css }),
      summary: `Compiled ${report.restored} of ${report.found} equation images to MathML`,
      at: Date.now(),
    }, deferDisplay)
    return report
  }

  /** Whether the reader is showing rewritten sections or the publisher's. */
  isShowingRewritten(): boolean {
    return this.#showRewritten
  }

  hasRewrite(sectionIndex: number): boolean {
    return this.#rewrites.has(sectionIndex)
  }

  describeRewrite(sectionIndex: number): RewriteSummary | undefined {
    const rewrite = this.#rewrites.get(sectionIndex)
    if (!rewrite) return undefined
    const summary = currentVersion(rewrite)?.summary
    return {
      sectionIndex,
      ...(summary === undefined ? {} : { summary }),
      versions: rewrite.versions.length,
      ...(this.#pendingRewriteSections.has(sectionIndex) ? { pending: true } : {}),
    }
  }

  listRewrites(): readonly SectionRewrite[] {
    return [...this.#rewrites.values()].sort((a, b) => a.sectionIndex - b.sectionIndex)
  }

  /** Show the publisher's markup or the agent's, across the whole book. */
  async showRewritten(showRewritten: boolean): Promise<number> {
    return this.#mutateRemaster(() => this.#showRewrittenNow(showRewritten))
  }

  async #showRewrittenNow(showRewritten: boolean): Promise<number> {
    if (
      this.#showRewritten === showRewritten &&
      !(showRewritten && this.#pendingRewriteSections.size > 0)
    ) return 0
    this.#showRewritten = showRewritten
    // Only what is on screen has to be rebuilt; the rest is served correctly
    // the next time it loads, because the transform consults this flag.
    const rendered = (this.#active?.view.renderer.getContents() ?? [])
      .map((content) => content.index)
      .filter((index) => this.#rewrites.has(index))
    for (const sectionIndex of rendered) {
      await this.#refreshSectionInPlace(sectionIndex)
      if (showRewritten) this.#pendingRewriteSections.delete(sectionIndex)
    }
    return rendered.length
  }

  /** Throw an agent's work away and put the publisher's section back. */
  async resetSection(sectionIndex: number): Promise<boolean> {
    return this.#mutateRemaster(() => this.#resetSectionNow(sectionIndex))
  }

  async #resetSectionNow(sectionIndex: number): Promise<boolean> {
    if (!this.#rewrites.has(sectionIndex)) return false
    // Forget it in the library first: a reset the library did not accept would
    // come back on the next reload, which is the opposite of what Reset means.
    await this.#persist((store, bookId) => store.reset(bookId, sectionIndex))
    this.#rewrites.delete(sectionIndex)
    this.#pendingRewriteSections.delete(sectionIndex)
    if (this.#showRewritten) await this.#refreshSectionInPlace(sectionIndex)
    return true
  }

  /** Step back one revision. Returns how many of the agent's remain. */
  async undoSection(sectionIndex: number): Promise<{ readonly versions: number } | undefined> {
    return this.#mutateRemaster(() => this.#undoSectionNow(sectionIndex))
  }

  async #undoSectionNow(sectionIndex: number): Promise<{ readonly versions: number } | undefined> {
    const existing = this.#rewrites.get(sectionIndex)
    if (!existing || existing.versions.length === 0) return undefined
    await this.#persist((store, bookId) => store.undo(bookId, sectionIndex))
    const versions = existing.versions.slice(0, -1)
    if (versions.length === 0) this.#rewrites.delete(sectionIndex)
    else this.#rewrites.set(sectionIndex, { ...existing, versions })
    this.#pendingRewriteSections.delete(sectionIndex)
    if (this.#showRewritten) await this.#refreshSectionInPlace(sectionIndex)
    return { versions: versions.length }
  }

  /** Serialize remaster writes so a fingerprint is a real compare-and-set guard. */
  #mutateRemaster<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#remasterMutations.then(operation, operation)
    this.#remasterMutations = result.then(() => undefined, () => undefined)
    return result
  }

  /**
   * Load this book's saved rewrites.
   *
   * A library that cannot be read is not a reason to refuse the book: the
   * reader opens as published and says nothing, because a person who came to
   * read should not be stopped by a feature they may never use.
   */
  async #hydrateRewrites(revision: number): Promise<void> {
    const store = this.#rewriteStore
    const bookId = this.#bookId
    if (!store || !bookId) return
    try {
      const stored = await store.load(bookId)
      if (revision !== this.#revision) return
      for (const rewrite of stored) {
        if (rewrite.versions.length === 0) continue
        this.#rewrites.set(rewrite.sectionIndex, {
          sectionIndex: rewrite.sectionIndex,
          versions: rewrite.versions,
        })
      }
    } catch {
      // Nothing saved is recoverable here, and the book still reads.
    }
  }

  #currentVersion(sectionIndex: number): SectionVersion | undefined {
    const rewrite = this.#rewrites.get(sectionIndex)
    return rewrite ? currentVersion(rewrite) : undefined
  }

  /**
   * Record a version and show it.
   *
   * The save comes first. If it fails, the reader is left showing exactly what
   * it was showing before and the caller is told — which is the truthful
   * outcome, because a rewrite the library did not accept is a rewrite that
   * would vanish on reload.
   */
  async #commit(
    sectionIndex: number,
    version: SectionVersion,
    deferDisplay = false,
  ): Promise<boolean> {
    const stored = await this.#persist((store, bookId) =>
      store.append(bookId, sectionIndex, version),
    )
    const existing = this.#rewrites.get(sectionIndex)
    const versions = [...(existing?.versions ?? []), version]
    this.#rewrites.set(sectionIndex, {
      sectionIndex,
      // Trimmed history is the saved history: memory must not offer an Undo
      // the library can no longer honour.
      versions: stored === undefined ? versions : versions.slice(-stored),
    })
    if (deferDisplay) {
      // ChatGPT's browser can refuse nested blob-frame navigation throughout
      // an agent-controlled operation, including timers queued by that call.
      // Never tear down the readable view here. The saved revision appears as
      // Ready and the person reveals it with the ordinary Rewritten control.
      if (!existing) this.#showRewritten = false
      this.#pendingRewriteSections.add(sectionIndex)
      return false
    }
    this.#showRewritten = true
    await this.#refreshSectionInPlace(sectionIndex)
    this.#pendingRewriteSections.delete(sectionIndex)
    return true
  }

  /**
   * Run a write against the rewrite store, if there is one.
   *
   * Returns the section's saved revision count, or `undefined` when nothing is
   * persisting — a reader with no library behind it still works, it simply
   * forgets rewrites when the page reloads.
   */
  async #persist(
    write: (store: RemasterStore, bookId: string) => Promise<number | void>,
  ): Promise<number | undefined> {
    const store = this.#rewriteStore
    const bookId = this.#bookId
    if (!store || !bookId) return undefined
    const result = await write(store, bookId)
    return typeof result === 'number' ? result : undefined
  }

  /**
   * Replace the body of an already mounted section and ask Foliate to measure
   * it again. Keeping the iframe itself alive is load-bearing: browser-control
   * hosts may reject a post-load navigation to Foliate's next `blob:` URL.
   *
   * Foliate's content range points at the body, which survives replaceChildren,
   * and its public render hook recalculates columns from that range. Resetting
   * the same-section anchor afterwards discards any Range into removed nodes.
   * A section not currently mounted needs no work; the transform supplies the
   * selected version when ordinary navigation loads it later.
   */
  async #refreshSectionInPlace(sectionIndex: number): Promise<void> {
    const active = this.#active
    if (!active) return
    const content = active.view.renderer.getContents().find((candidate) => candidate.index === sectionIndex)
    if (!content) return

    // A spine section is not necessarily a chapter. Flatland, for example,
    // puts most of the book in one XHTML file with TOC fragment anchors. Keep
    // the nearest logical heading so comparing versions does not fling the
    // person to the start of that enormous file.
    const logicalHref = active.view.lastLocation?.tocItem?.href

    const body = content.doc.body ?? content.doc.documentElement
    if (!body) throw new ReaderSectionLoadError(sectionIndex, this.#sectionLabel(sectionIndex))
    const resources = this.#sectionResourceMaps.get(sectionIndex) ?? new Map<string, string>()
    const version = this.#showRewritten ? this.#currentVersion(sectionIndex) : undefined

    this.#suppressRelocations += 1
    try {
      active.view.deselect()
      this.#clearSelection()
      if (version) {
        applyVersion(content.doc, version, resources)
      } else {
        const original = await this.#sectionSource(sectionIndex)()
        const originalBody = original.body ?? original.documentElement
        replaceBody(content.doc, body, originalBody?.innerHTML ?? '')
        body.removeAttribute('data-bookhand-remastered')
        content.doc.getElementById(REMASTER_STYLE_ID)?.remove()
        translateResources(content.doc, resources)
      }

      const logicalTarget = logicalHref
        ? active.view.resolveNavigation(logicalHref)
        : undefined
      const resolved = logicalTarget?.index === sectionIndex
        ? logicalTarget
        : active.view.resolveNavigation(sectionIndex)
      const settleAtPosition = async () => {
        active.view.renderer.render?.()
        if (resolved) await active.view.renderer.goTo(resolved)
      }
      await settleAtPosition()

      // Replacing the body fires Foliate's ResizeObserver after the first
      // synchronous pagination pass. In Chromium that late pass can restore
      // the old chapter's now-out-of-range scroll offset, leaving a blank page
      // until the person presses Previous or Next. Let layout and the observer
      // settle, then make the rewritten chapter's first page authoritative.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      await settleAtPosition()

      // Publisher and agent documents can have very different image/font
      // geometry. Give local assets one short bounded chance to report their
      // intrinsic sizes, then paginate once more so a late load cannot strand
      // the selected heading outside the visible canvas.
      const imagesReady = Promise.all(
        Array.from(content.doc.images).map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.addEventListener('load', () => resolve(), { once: true })
                image.addEventListener('error', () => resolve(), { once: true })
              }),
        ),
      )
      const fontsReady = content.doc.fonts?.ready ?? Promise.resolve()
      await Promise.race([
        Promise.all([imagesReady, fontsReady]),
        new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
      ])
      await settleAtPosition()
    } finally {
      this.#suppressRelocations = Math.max(0, this.#suppressRelocations - 1)
    }
    if (this.#marks.length > 0) this.renderAnnotations(this.#marks)
    if (this.#tutorTarget) void this.#renderTutorOverlay(this.#tutorGeneration)
  }
  #sectionSource(sectionIndex: number): () => Promise<Document> {
    const { book } = this.#requireActive()
    if (!this.#isValidSection(sectionIndex)) throw new ReaderSectionLoadError(sectionIndex)
    const create = book.sections[sectionIndex]?.createDocument
    if (!create) throw new ReaderSectionLoadError(sectionIndex, this.#sectionLabel(sectionIndex))
    return create
  }

  async #createSectionDocument(
    sectionIndex: number,
    sourcePolicy: 'displayed' | 'latest-rewrite' = 'latest-rewrite',
  ): Promise<Document> {
    const { book } = this.#requireActive()
    if (!this.#isValidSection(sectionIndex)) throw new ReaderSectionLoadError(sectionIndex)
    try {
      await this.#options.faults?.beforeSectionLoad?.(sectionIndex)
      const create = book.sections[sectionIndex]?.createDocument
      if (!create) throw new Error('The EPUB section has no document source')
      const document = await create()
      // Passage/snapshot reads must match what the person chose to display.
      // Index extraction keeps its existing latest-rewrite behavior; remaster
      // reindexing is a separate product decision, not part of this repair.
      const version = sourcePolicy === 'displayed' && !this.#showRewritten
        ? undefined
        : currentVersion(this.#rewrites.get(sectionIndex) ?? emptyRewrite)
      if (version) applyVersion(document, version)
      return document
    } catch (error) {
      const wrapped = new ReaderSectionLoadError(sectionIndex, this.#sectionLabel(sectionIndex), error)
      this.#options.onSectionError?.(wrapped)
      throw wrapped
    }
  }

  async #loadResolvedTarget(active: ActiveReader, target: FoliateResolvedTarget): Promise<void> {
    try {
      await this.#options.faults?.beforeSectionLoad?.(target.index)
      await active.view.renderer.goTo(target)
    } catch (error) {
      const wrapped = new ReaderSectionLoadError(target.index, this.#sectionLabel(target.index), error)
      this.#options.onSectionError?.(wrapped)
      throw wrapped
    }
  }

  #resolveCfi(book: FoliateBook, cfi: string, document: Document, sectionIndex: number): Range {
    const target = book.resolveCFI?.(cfi)
    if (!target || target.index !== sectionIndex || typeof target.anchor !== 'function') {
      throw new ReaderNavigationError({ kind: 'cfi', cfi })
    }
    const value = target.anchor(document)
    const RangeConstructor = document.defaultView?.Range ?? Range
    if (!(value instanceof RangeConstructor)) throw new ReaderNavigationError({ kind: 'cfi', cfi })
    return value
  }

  #chapterBreadcrumb(sectionIndex: number): readonly string[] {
    const label = this.#sectionLabel(sectionIndex)
    return label ? [label] : []
  }

  #sectionLabel(sectionIndex: number): string | undefined {
    return this.#sections[sectionIndex]?.label
  }

  #isValidSection(sectionIndex: number): boolean {
    return Number.isInteger(sectionIndex) && sectionIndex >= 0 && sectionIndex < this.#sections.length
  }

  #requireActive(): ActiveReader {
    if (!this.#active) throw new ReaderNotOpenError()
    return this.#active
  }

  #assertCurrent(revision: number): void {
    if (revision !== this.#revision) throw new ReaderClosedError()
  }

  #clearSelection(): void {
    if (!this.#selection) return
    this.#selection = null
    this.#active?.view.deselect()
    this.#options.onSelectionChange?.(null)
  }

  async #recoverStalledView(stalled: ActiveReader, revision: number): Promise<void> {
    if (revision !== this.#revision || this.#active !== stalled) return
    const { book } = stalled

    const view = document.createElement('foliate-view') as FoliateView
    // Recovery is speculative. Keep the last reader mounted until its
    // replacement has rendered successfully, so a second failure cannot turn
    // one bad chapter load into an empty application-wide reader.
    Object.assign(view.style, {
      position: 'fixed',
      inset: '0',
      visibility: 'hidden',
      pointerEvents: 'none',
    })
    const cleanups = [...this.#listen(view)]
    const replacement: ActiveReader = {
      book,
      view,
      cleanups,
      ...(stalled.transformCleanup ? { transformCleanup: stalled.transformCleanup } : {}),
    }
    this.#host.append(view)
    this.#suppressRelocations += 1
    try {
      await withDeadline(
        view.open(book),
        this.#options.openDeadlineMs ?? BOOK_OPEN_DEADLINE_MS,
        this.#options.clock ?? systemClock,
      )
      if (revision !== this.#revision || this.#active !== stalled) throw new ReaderClosedError()
      cleanups.push(configureForViewport(view, () => this.#style.pageLayout ?? 'auto'))
      cleanups.push(this.#listenForRendererRelocations(view))
      view.renderer.setStyles?.(makeReaderCss(this.#style))
      await withDeadline(
        view.init({
          ...(this.#location?.cfi ? { lastLocation: this.#location.cfi } : {}),
          showTextStart: true,
        }),
        this.#options.openDeadlineMs ?? BOOK_OPEN_DEADLINE_MS,
        this.#options.clock ?? systemClock,
      )
      if (revision !== this.#revision || this.#active !== stalled) throw new ReaderClosedError()
      this.#active = replacement
      Object.assign(view.style, {
        position: '',
        inset: '',
        visibility: '',
        pointerEvents: '',
      })
      this.#host.replaceChildren(view)
      this.#dispose(stalled, false)
      this.renderAnnotations(this.#marks)
      if (this.#tutorTarget) void this.#renderTutorOverlay(this.#tutorGeneration)
    } catch (error) {
      this.#dispose(replacement, false)
      throw error
    } finally {
      this.#suppressRelocations = Math.max(0, this.#suppressRelocations - 1)
      this.#relocationProvenance.length = 0
    }
  }

  #destroyActive(): void {
    const active = this.#active
    this.#active = undefined
    if (!active) {
      this.#host.replaceChildren()
      return
    }
    this.#dispose(active)
    this.#host.replaceChildren()
  }

  #dispose(active: ActiveReader, destroyBook = true): void {
    if (this.#disposedViews.has(active.view)) return
    this.#disposedViews.add(active.view)
    for (const cleanup of active.cleanups) cleanup()
    if (destroyBook) active.transformCleanup?.()
    active.view.close()
    active.view.remove()
    if (destroyBook) active.book.destroy?.()
  }

  #resetSnapshots(): void {
    this.#tutorGeneration += 1
    this.#tutorTarget = undefined
    this.#relocationProvenance.length = 0
    this.#activeNavigation = undefined
    this.#learnerIntentEpoch = 0
    this.#suppressRelocations = 0
    this.#navigationQueue = Promise.resolve()
    this.#toc = []
    this.#sections = []
    this.#location = undefined
    this.#selection = null
    this.#marks = []
    this.#rewrites.clear()
    this.#pendingRewriteSections.clear()
    this.#sectionResourceMaps.clear()
  }
}

function noop(): void {}

/** A stand-in so a missing rewrite reads the same as an empty one. */
const emptyRewrite: SectionRewrite = { sectionIndex: -1, versions: [] }

function countElements(html: string): number {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body
    .querySelectorAll('*').length
}

async function loadFoliate(): Promise<FoliateModule> {
  return import('./foliate-module.ts')
}

function blockPackagedScripts(book: FoliateBook): void {
  book.transformTarget?.addEventListener('load', (event) => {
    const detail = (event as CustomEvent<{ isScript?: boolean; allow: boolean }>).detail
    if (detail.isScript) detail.allow = false
  })
}

function mapToc(items: readonly FoliateTocItem[], parent = 'toc'): readonly TocItem[] {
  return items.map((item, index) => {
    const id = `${parent}-${item.id ?? index}`
    const children = mapToc(item.subitems ?? [], id)
    const href = item.href ?? firstTocHref(children)
    return {
      id,
      label: localized(item.label) || `Section ${index + 1}`,
      href,
      target: href ? { kind: 'href' as const, href } : { kind: 'section' as const, sectionIndex: index },
      children,
    }
  })
}

function mapSections(sections: readonly FoliateBook['sections'][number][], toc: readonly TocItem[]): readonly BookSection[] {
  const labels = new Map<string, string>()
  const collect = (items: readonly TocItem[]) => {
    for (const item of items) {
      if (item.href) {
        const sectionHref = item.href.split('#')[0] ?? item.href
        if (!labels.has(sectionHref)) labels.set(sectionHref, item.label)
      }
      collect(item.children)
    }
  }
  collect(toc)
  return sections.map((section, index) => ({
    index,
    id: section.id,
    href: section.id ?? `section-${index}`,
    label: section.id ? labels.get(section.id) : undefined,
    linear: section.linear !== 'no',
  }))
}

function firstTocHref(items: readonly TocItem[]): string | undefined {
  for (const item of items) {
    if (item.href) return item.href
    const nested = firstTocHref(item.children)
    if (nested) return nested
  }
  return undefined
}

/** The touch-first condition the reader's own stylesheet uses. Keep in step. */
const COMPACT_QUERY = '(max-width: 860px), (pointer: coarse)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Foliate's paginator is configured entirely through attributes, and Bookhand
 * was setting none of them. These are the four that matter, kept in step with
 * the viewport, since the same element outlives a rotation.
 *
 * `animated` is withheld under reduced motion: the page turn then completes
 * instantly, which is the behaviour that setting asks for.
 */
function applyPageLayout(
  view: FoliateView,
  layout: NonNullable<ReaderStyle['pageLayout']>,
): void {
  const isCompact = globalThis.matchMedia?.(COMPACT_QUERY).matches ?? false
  const columns = layout === 'single' || isCompact ? '1' : '2'
  for (const target of readerConfigurationTargets(view)) {
    target.setAttribute('max-column-count', columns)
  }
}

function readerConfigurationTargets(view: FoliateView): HTMLElement[] {
  const element = view as unknown as HTMLElement
  const renderer = (view as FoliateView & { renderer?: unknown }).renderer
  return renderer instanceof HTMLElement ? [element, renderer] : [element]
}

function configureForViewport(
  view: FoliateView,
  pageLayout: () => NonNullable<ReaderStyle['pageLayout']>,
): () => void {
  const compact = globalThis.matchMedia?.(COMPACT_QUERY)
  const reduced = globalThis.matchMedia?.(REDUCED_MOTION_QUERY)

  const apply = () => {
    const isCompact = compact?.matches ?? false
    for (const target of readerConfigurationTargets(view)) {
      const margin = isCompact ? '20px' : '48px'
      target.setAttribute('margin', margin)
      for (const side of ['top', 'right', 'bottom', 'left']) {
        target.setAttribute(`margin-${side}`, margin)
      }
      target.setAttribute('gap', isCompact ? '5%' : '7%')
      // Bookhand owns one active section and one stable content frame. The
      // candidate defaults to adjacent-section preloading; opt out at the
      // adapter boundary so renderer internals do not make getContents()
      // multi-valued during navigation.
      target.setAttribute('no-preload', '')
      target.setAttribute('no-continuous-scroll', '')
      if (reduced?.matches) target.removeAttribute('animated')
      else target.setAttribute('animated', '')
    }
    applyPageLayout(view, pageLayout())
  }

  apply()
  compact?.addEventListener('change', apply)
  reduced?.addEventListener('change', apply)
  return () => {
    compact?.removeEventListener('change', apply)
    reduced?.removeEventListener('change', apply)
  }
}

function crossesSectionBoundary(
  view: FoliateView,
  direction: 'previous' | 'next',
): boolean {
  const renderer = view.renderer
  if (
    !renderer.hasAttribute('animated')
    || renderer.hasAttribute('eink')
    || typeof document.startViewTransition !== 'function'
    || document.hidden
    || typeof renderer.page !== 'number'
    || typeof renderer.pages !== 'number'
  ) return false
  if (direction === 'previous') return renderer.page! <= 0 && !renderer.atStart
  return renderer.page! >= renderer.pages! - 1 && !renderer.atEnd
}

async function animateSectionBoundaryTurn(
  view: FoliateView,
  direction: 'previous' | 'next',
  turn: () => Promise<void>,
): Promise<void> {
  const renderer = view.renderer
  const documentDirection = renderer.getContents()[0]?.doc.documentElement.dir
  const forward = direction === 'next'
  const movesRight = (documentDirection === 'rtl') === forward
  const root = document.documentElement
  const page = view as unknown as HTMLElement
  const classes = [
    'bookhand-spine-turn',
    forward ? 'bookhand-spine-turn-forward' : 'bookhand-spine-turn-backward',
    movesRight ? 'bookhand-spine-turn-right' : 'bookhand-spine-turn-left',
  ]
  const bookDocument = renderer.getContents()[0]?.doc
  const background = bookDocument?.documentElement
    ? bookDocument.defaultView?.getComputedStyle(bookDocument.documentElement)
      .getPropertyValue('--theme-bg-color').trim()
    : ''

  page.style.viewTransitionName = 'bookhand-spine-turn'
  root.style.setProperty('--bookhand-spine-turn-background', background || 'Canvas')
  root.classList.add(...classes)
  const cleanup = () => {
    root.classList.remove(...classes)
    root.style.removeProperty('--bookhand-spine-turn-background')
    page.style.removeProperty('view-transition-name')
  }

  let transition: ViewTransition
  try {
    transition = document.startViewTransition(() => turn())
  } catch {
    cleanup()
    await turn()
    return
  }
  try {
    await transition.updateCallbackDone
    await transition.finished.catch(() => undefined)
  } finally {
    cleanup()
  }
}

interface TutorCueDrawOptions {
  readonly color?: string
  readonly kind?: TutorCue['kind']
  readonly writingMode?: string
}

interface CueRect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly width: number
  readonly height: number
}

function svgElement(tag: string): SVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', tag)
}

function cueBounds(rects: readonly CueRect[]): CueRect {
  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const right = Math.max(...rects.map((rect) => rect.right))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

function appendCueRect(
  group: SVGElement,
  bounds: CueRect,
  attributes: Readonly<Record<string, string | number>>,
): void {
  const rect = svgElement('rect')
  rect.setAttribute('x', String(bounds.left))
  rect.setAttribute('y', String(bounds.top))
  rect.setAttribute('width', String(bounds.width))
  rect.setAttribute('height', String(bounds.height))
  for (const [name, value] of Object.entries(attributes)) rect.setAttribute(name, String(value))
  group.append(rect)
}

/**
 * Turn Foliate's fragment rectangles into one legible teaching gesture.
 *
 * Native painters intentionally mark every fragment. That is right for a
 * durable text highlight and disastrous for a tutor pointing at a whole
 * paragraph: inline formula images and column fragments become dozens of tiny
 * boxes. Precise targets receive one composed mark. Broad targets degrade to a
 * quiet block wash with one accent rule per visible column, never a page full
 * of outlines.
 */
function drawTutorCue(
  input: readonly DOMRect[],
  options: TutorCueDrawOptions = {},
): Element {
  const color = options.color ?? 'currentColor'
  const kind = options.kind ?? 'highlight'
  const vertical = options.writingMode === 'vertical-rl' || options.writingMode === 'vertical-lr'
  // Foliate passes a DOMRectList in browsers even though its drawing API is
  // naturally typed as a readonly collection. DOMRectList is iterable but has
  // no Array methods.
  const rects = Array.from(input)
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    }))
  const group = svgElement('g')
  if (rects.length === 0) return group

  const all = cueBounds(rects)
  const broad = rects.length > 12 || (vertical ? all.width : all.height) > 220
  group.setAttribute('data-bookhand-tutor-scope', broad ? 'broad' : 'precise')

  if (broad) {
    // Rectangle midpoint is not a reliable column signal: inline MathML and
    // justified text can span enough width to be classified into a second
    // pseudo-column. That produced overlapping washes and an accent rule in
    // the middle of the paragraph. A broad request is intentionally one calm
    // region, even when that includes the gutter of a real two-page spread.
    appendCueRect(group, all, { fill: color, opacity: 0.08, rx: 3 })
    const rule = svgElement('rect')
    if (vertical) {
      rule.setAttribute('x', String(all.left))
      rule.setAttribute('y', String(Math.max(0, all.top - 7)))
      rule.setAttribute('width', String(all.width))
      rule.setAttribute('height', '3')
    } else {
      // The rule points from the margin. Drawing it on the range boundary
      // covers the first stroke of the book's own text, especially at small
      // sizes and in justified columns.
      rule.setAttribute('x', String(Math.max(0, all.left - 7)))
      rule.setAttribute('y', String(all.top))
      rule.setAttribute('width', '3')
      rule.setAttribute('height', String(all.height))
    }
    rule.setAttribute('fill', color)
    group.append(rule)
    return group
  }

  if (kind === 'underline') {
    const rule = svgElement('rect')
    rule.setAttribute('x', String(all.left))
    rule.setAttribute('y', String(vertical ? all.top : all.bottom - 2))
    rule.setAttribute('width', String(vertical ? 2 : all.width))
    rule.setAttribute('height', String(vertical ? all.height : 2))
    rule.setAttribute('fill', color)
    group.append(rule)
  } else if (kind === 'outline') {
    appendCueRect(group, all, { fill: 'none', stroke: color, 'stroke-width': 2, rx: 3 })
  } else {
    appendCueRect(group, all, { fill: color, opacity: 0.16, rx: 3 })
  }
  return group
}

function makeReaderCss(style: ReaderStyle): string {
  const theme = bookPalette(style.theme)
  const family = style.fontFamily ? JSON.stringify(style.fontFamily) : 'inherit'
  return `
    :root { color-scheme: ${style.theme === 'dark' ? 'dark' : 'light'}; background: ${theme.canvas}; color: ${theme.ink}; font-size: ${style.fontSizePercent}% !important; }
    body { background: ${theme.canvas}; color: ${theme.ink}; }
    body { max-width: ${style.measureCh}ch; margin-inline: auto; font-family: ${family}; font-size: 1rem !important; }
    p, li, blockquote, dd { line-height: ${style.lineHeight}; }
    p { margin-block: ${style.paragraphSpacingEm}em; }
    img, svg, video { max-inline-size: 100%; block-size: auto; }
    ${
      style.theme === 'dark'
        ? // Inline mathematics in this book, and in anything else produced by
          // the same TeX pipeline, is a monochrome black glyph image. On a dark
          // page it is not dim, it is invisible — a book about dy/dx whose
          // dy/dx cannot be seen. Inverting only these is deliberate: they are
          // known to be black-on-transparent line art, which figures and
          // photographs are not.
          'img[data-tex] { filter: invert(1); }'
        : ''
    }
    /* Chrome for Android inflates text inside an iframe that has no viewport
       meta of its own, by a factor taken from the frame width. The paginator's
       column arithmetic comes from the container, not from the inflated text,
       so the two disagree and lines clip. Pinning it keeps them in step. */
    html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    ${style.customCss ? boundCustomCss(style.customCss).css : ''}
    /* A repaired chapter may choose its typography, but it may not replace
       the paginator's viewport with a fixed poster-sized page. These rules
       come last and preserve flow without flattening the agent's design. */
    body[data-bookhand-remastered] { inline-size: auto !important; min-inline-size: 0 !important; block-size: auto !important; min-block-size: 0 !important; overflow: visible !important; position: static !important; transform: none !important; }
    body[data-bookhand-remastered] > article,
    body[data-bookhand-remastered] > main,
    body[data-bookhand-remastered] > section { inline-size: auto !important; min-inline-size: 0 !important; max-inline-size: 100% !important; box-sizing: border-box; }
    body[data-bookhand-remastered] :is(header, h1, h2, h3) { break-inside: avoid; }
    body[data-bookhand-remastered] :is(h1, h2, h3) { overflow-wrap: normal !important; word-break: normal !important; hyphens: none; text-wrap: balance; }
    body[data-bookhand-remastered] h1 { font-size: 2rem !important; line-height: 1.15 !important; }
    body[data-bookhand-remastered] h2 { font-size: 1.55rem !important; line-height: 1.2 !important; }
    body[data-bookhand-remastered] h3 { font-size: 1.25rem !important; line-height: 1.25 !important; }
  `
}
