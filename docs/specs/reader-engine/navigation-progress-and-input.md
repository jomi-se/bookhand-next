# Navigation, progress, and input

## User-visible goal

Every route into the book lands on the intended source, Back behaves
predictably, the last-read position survives lifecycle transitions, and each
intentional key, wheel, touch, or pointer gesture causes at most one action in
the correct reading direction.

## Why it matters

TOC entries, CFIs, search hits, annotations, study citations, page lists, and
agent focus fail differently if they use separate coordinate systems. Input is
also received inside the EPUB frame, where normal application event bubbling
and late cancellation do not work.

## Behavioral requirements

- **Verified MIT renderer / adopt:** Section indexes, hrefs/fragments, CFIs,
  fractions, TOC entries, page-list entries, and search results converge on one
  resolver and navigation path. Unsupported or invalid targets fail by name.
- **Bookhand requirement:** Exact CFI/range plus section/text evidence is the
  durable coordinate. Byte-derived location/time estimates and displayed
  percentages are projections only.
- **Mixed / implement independently:** Distinguish live layout anchor, emitted
  relocation, visible UI location, queued durable write, and confirmed saved
  last-read state.
- **Verified AGPL behavior / implement independently:** Coalesce hot relocation
  updates, debounce persistence, and flush on visibility loss, page hide, and
  unmount. Initial no-op and temporary deep-link/agent guidance must not alter
  the person's durable last-read timestamp or position.
- **Mixed / adopt semantics:** Explicit jumps add history; incidental scroll,
  snap, resize, and page relocation replace the current entry. Tutor Back uses
  its own one-level temporary origin rather than corrupting reading history.
- **Mixed / implement independently:** Physical left/right, swipe, wheel, and
  hardware inputs map to logical previous/next after considering writing mode,
  book direction, layout axis, and browser scroll sign.
- **Verified AGPL behavior / implement independently:** Paginated wheel input
  normalizes delta modes, waits for dominant-axis intent, turns once, and
  suppresses momentum until idle. Scrolled mode retains native wheel behavior.
- **Verified AGPL behavior / implement independently:** Relevant iframe key
  events are handled synchronously, ignore editable/interactive targets, and do
  not repeat navigation while a key is held.
- **Mixed / implement independently:** A priority-based gesture owner lets
  selection, annotation, pinch, native reserved areas, or scroll locks decline
  page turning; consuming a gesture suppresses its trailing synthetic click.

## Edge cases and failure modes

- Nested TOC items, fragment-only subchapters in one file, decorative/non-link
  headings, percent-encoded hrefs, and page-list labels.
- Navigation races with close, a later navigation, or remaster switching.
- Infinite/continuous scrolling that never reaches the relocation debounce.
- RTL negative `scrollLeft`; vertical-rl page progression; vertical-lr scroll.
- Trackpad inertia, line/page wheel modes, diagonal input, key repeat, mouse
  back/forward buttons, pinch, long press, and link activation after a swipe.
- Selection exists across more than one loaded section.

## Known footguns

- Posting an iframe key event to the parent after the browser default has run.
- Mapping physical right to next in every book.
- Treating a programmatic preview as evidence that the person read that place.
- Persisting every relocation synchronously or postponing all persistence until
  idle/background frames that may never run.
- Allowing each component to install its own competing touch listeners.

## Bookhand constraints and conflicts

All external targets remain serializable `BookTarget` values through
`ReaderAdapter`. WebMCP returns and consumes existing targets; it must never
invent a renderer DOM coordinate. Temporary tutor guidance is visibly
attributed, stoppable, and nonpersistent. Vertical-lr scrolled support must be
reported as unsupported until proved, not inferred from vertical-rl.

## Provenance and source pointers

- MIT renderer: `view.js`, `paginator.js`, `progress.js`, `epubcfi.js`,
  `search.js` at `ca3f118`; history `317051e`, `29156ad`, `c558766`,
  `f015af2`, `cecaef9`, `fd91451`.
- AGPL behavior: `FoliateViewer.tsx`, `usePagination.ts`,
  `useFoliateEvents.ts`, `useProgressAutoSave.ts`, `useTouchInterceptor.ts`,
  `useRendererInputListeners.ts`, `iframeEventHandlers.ts`, `wheelGesture.ts`,
  and `useSearchNav.ts` at `180795fb`.
- Bookhand: `VAL-READER-NAV`, `VAL-READER-RESTORE`, reader guidance contracts,
  and `src/domain/reader.ts`.

## Validation ideas

Use independent LTR, RTL, vertical-rl, nested-TOC, page-list, same-file-fragment,
and malformed-target fixtures. Differentially navigate each target type and
verify the source quote plus history. Exercise wheel delta modes and inertia,
keyboard focus/editables/repeat, selection-versus-swipe, trailing clicks,
visibility/pagehide flush, and endless autoscroll relocation. Physical-device
evidence remains distinct from emulation.

## Adoption disposition

Adopt the MIT unified resolver, CFI, direction, and relocation primitives that
pass Bookhand's boundary. Implement application input ownership, persistence,
and history policy independently. Defer native hardware integrations.
