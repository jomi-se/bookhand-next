import type { MutationOrigin, StudyBoardView } from '../domain/index.ts'

/**
 * Which panel is open, and what the study board was asked to do.
 *
 * Panel visibility used to be React state inside the reader screen, which meant
 * a tool could change the stored `docked`/`expanded` preference but could not
 * open, focus, or close the board — the three things the architecture promised
 * and the only ones a person watching would actually notice. Sharing the state
 * makes all four modes reachable from both sides, and makes each one land on
 * the mounted interface immediately rather than at the next render that happens
 * to read storage. `VAL-BOARD-VIEW-PARITY`.
 */

export type ReaderPanel = 'contents' | 'search' | 'text' | 'study' | 'tutor' | null

/**
 * `docked` and `expanded` are persistent layout preferences. `focus` and
 * `close` are momentary: they change what is on screen and what holds focus,
 * and deliberately leave the preference alone, so an agent that pulls the
 * person's attention to the board cannot silently rearrange their reader.
 */
export type BoardMode = 'docked' | 'expanded' | 'focus' | 'close'

export interface BoardReversal {
  readonly origin: MutationOrigin
  readonly actionGroupId: string
  readonly priorView: StudyBoardView
  readonly priorOpen: boolean
}

export interface SurfaceState {
  readonly panel: ReaderPanel
  /**
   * Raised whenever something asks the board to take focus. A counter rather
   * than a flag, so two consecutive focus requests are two events.
   */
  readonly focusNonce: number
  /** A tool-originated layout change, while the person can still take it back. */
  readonly boardReversal?: BoardReversal
}

type Listener = (state: SurfaceState) => void

export class SurfaceStore {
  #state: SurfaceState = { panel: null, focusNonce: 0 }
  readonly #listeners = new Set<Listener>()

  get state(): SurfaceState {
    return this.#state
  }

  get boardOpen(): boolean {
    return this.#state.panel === 'study'
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /**
   * Start again for a different book. The reversal in particular has to go: it
   * names a layout on a board that is no longer open.
   */
  reset(): void {
    this.#state = { panel: null, focusNonce: 0 }
    for (const listener of this.#listeners) listener(this.#state)
  }

  setPanel(panel: ReaderPanel): void {
    if (this.#state.panel === panel) return
    this.#set({ panel })
  }

  /** Open the board. `focus` additionally moves focus to its heading. */
  openBoard(options: { readonly focus?: boolean } = {}): void {
    this.#set({
      panel: 'study',
      ...(options.focus ? { focusNonce: this.#state.focusNonce + 1 } : {}),
    })
  }

  /** Return to the book. Nothing on the board is deleted or reordered. */
  closeBoard(): void {
    if (this.#state.panel !== 'study') return
    this.#set({ panel: null })
  }

  /**
   * Remember a persistent layout change the person may want back. Cleared once
   * taken, and cleared by a change the person made themselves — an Undo offered
   * for something you just did yourself is noise.
   */
  recordBoardReversal(reversal: BoardReversal | undefined): void {
    this.#set({ ...(reversal ? { boardReversal: reversal } : { boardReversal: undefined }) })
  }

  #set(patch: Partial<SurfaceState>): void {
    const next = { ...this.#state, ...patch }
    if (patch.boardReversal === undefined && 'boardReversal' in patch) {
      delete (next as { boardReversal?: BoardReversal }).boardReversal
    }
    this.#state = next
    for (const listener of this.#listeners) listener(next)
  }
}
