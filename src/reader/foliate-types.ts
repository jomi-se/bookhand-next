interface FoliateContributor {
  readonly name?: string | Readonly<Record<string, string>>
  readonly sortAs?: string | Readonly<Record<string, string>>
}

export interface FoliateTocItem {
  readonly id?: string | number
  readonly label?: string | Readonly<Record<string, string>>
  readonly href?: string
  readonly subitems?: readonly FoliateTocItem[]
}

export interface FoliateSection {
  readonly id?: string
  readonly linear?: string
  readonly cfi?: string
  readonly createDocument?: () => Promise<Document>
  /** Drop this section from the loader's blob-URL cache. */
  readonly unload?: () => void
  /** Resolve a section-relative href against the package. */
  readonly resolveHref?: (href: string) => string
}

export interface FoliateBook {
  readonly metadata?: {
    readonly title?: string | Readonly<Record<string, string>>
    readonly subtitle?: string | Readonly<Record<string, string>>
    readonly author?: string | FoliateContributor | readonly (string | FoliateContributor)[]
    readonly language?: string | readonly string[]
    readonly publisher?: string | FoliateContributor | readonly FoliateContributor[]
    readonly description?: string
    readonly published?: string
    readonly modified?: string
    readonly identifier?: string
  }
  readonly toc?: readonly FoliateTocItem[]
  readonly sections: readonly FoliateSection[]
  readonly transformTarget?: EventTarget
  /** Read a packaged file as text. Used to recover a section's raw source. */
  loadText?(href: string): Promise<string> | string
  getCover?(): Promise<Blob | null> | Blob | null
  resolveCFI?(cfi: string): FoliateResolvedTarget
  resolveHref?(href: string): FoliateResolvedTarget | null
  destroy?(): void
}

export interface FoliateResolvedTarget {
  readonly index: number
  readonly anchor?: number | ((document: Document) => Node | Range)
}

export interface FoliateRelocation {
  readonly reason?: string
  readonly cfi?: string
  readonly range?: Range
  readonly fraction?: number
  readonly section?: { readonly current?: number }
  readonly tocItem?: FoliateTocItem
}

export interface FoliateRenderer extends HTMLElement {
  readonly page?: number
  readonly pages?: number
  readonly atStart?: boolean
  readonly atEnd?: boolean
  goTo(target: FoliateResolvedTarget): Promise<void>
  prev(distance?: number): Promise<void>
  next(distance?: number): Promise<void>
  getContents(): readonly {
    readonly index: number
    readonly doc: Document
    readonly overlayer?: FoliateOverlayInstance
  }[]
  setStyles?(styles: string): void
  /** Re-run pagination after the section content changed under the renderer. */
  render?(): void
}

export interface FoliateOverlayInstance {
  readonly element?: Element
  add(
    key: string,
    range: Range,
    draw: FoliateDrawFunction,
    options?: Record<string, unknown>,
  ): unknown
  remove(key: string): unknown
  redraw?(): unknown
}

/** The shape Foliate hands back through its `draw-annotation` event. */
export interface FoliateAnnotationValue {
  readonly value: string
  readonly color?: string
}

export type FoliateDrawFunction = (
  rects: readonly DOMRect[],
  options?: Record<string, unknown>,
) => Element

export interface FoliateDrawDetail {
  readonly draw: (func: FoliateDrawFunction, options?: Record<string, unknown>) => void
  readonly annotation: FoliateAnnotationValue
}

export interface FoliateView extends HTMLElement {
  book: FoliateBook
  renderer: FoliateRenderer
  history: { pushState(target: unknown): void }
  lastLocation?: FoliateRelocation
  open(book: FoliateBook): Promise<void>
  init(options: { lastLocation?: string; showTextStart: boolean }): Promise<void>
  close(): void
  getCFI(index: number, range?: Range): string
  resolveNavigation(target: string | number): FoliateResolvedTarget | undefined
  deselect(): void
  addAnnotation?(annotation: FoliateAnnotationValue, remove?: boolean): Promise<unknown>
  deleteAnnotation?(annotation: FoliateAnnotationValue): Promise<unknown>
}

export interface FoliateOverlayer {
  readonly highlight: FoliateDrawFunction
  readonly underline: FoliateDrawFunction
  readonly outline: FoliateDrawFunction
}

export interface FoliateModule {
  makeBook(file: File): Promise<FoliateBook>
  readonly Overlayer?: FoliateOverlayer
}
