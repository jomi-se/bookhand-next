import type {
  FoliateReaderAdapterOptions,
  ReaderAdapterEvents,
} from './FoliateReaderAdapter.ts'

/**
 * The adapter is constructed once and outlives every later render, so it must
 * not close over the options object present at mount. This binds a stable
 * options object that re-reads the caller's latest options on each access.
 *
 * Every event is forwarded from one list, checked at compile time. The
 * hand-written version silently dropped any handler nobody remembered to add
 * here — `onAnnotationActivate` had been unreachable since it was introduced,
 * and `onTap` would have been next. A forgotten handler is invisible: nothing
 * fails, the feature simply never happens.
 */
const FORWARDED: { readonly [K in keyof Required<ReaderAdapterEvents>]: true } = {
  onLocationChange: true,
  onSelectionChange: true,
  onSectionError: true,
  onAnnotationActivate: true,
  onTap: true,
  onKeyboardActivity: true,
  onReaderInteraction: true,
  onNavigationIntent: true,
  onNavigationRequest: true,
}

const EVENT_NAMES = Object.keys(FORWARDED) as (keyof ReaderAdapterEvents)[]

export function bindLatestOptions(
  latest: () => FoliateReaderAdapterOptions | undefined,
): FoliateReaderAdapterOptions {
  const events = Object.fromEntries(
    EVENT_NAMES.map((name) => [
      name,
      (...args: unknown[]) => {
        const handler = latest()?.[name] as ((...values: unknown[]) => void) | undefined
        return handler?.(...args)
      },
    ]),
  ) as ReaderAdapterEvents

  return {
    ...events,
    get clock() {
      return latest()?.clock
    },
    get openDeadlineMs() {
      return latest()?.openDeadlineMs
    },
    get navigationDeadlineMs() {
      return latest()?.navigationDeadlineMs
    },
    get faults() {
      return latest()?.faults
    },
    get tutorOverlayRenderer() {
      return latest()?.tutorOverlayRenderer
    },
  }
}
