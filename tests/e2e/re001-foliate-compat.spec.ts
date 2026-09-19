import { expect, test, type Page } from '@playwright/test'

test.use({
  deviceScaleFactor: 1.25,
  launchOptions: { args: ['--enable-features=WebMCPTesting'] },
})

async function callSiteTool(page: Page, name: string, input: unknown = {}) {
  return page.evaluate(async ([toolName, args]) => {
    const context = document.modelContext
    if (!context) throw new Error('WebMCP is unavailable')
    const tool = (await context.getTools()).find((candidate) => candidate.name === toolName)
    if (!tool) throw new Error(`Missing tool: ${toolName}`)
    return JSON.parse(await context.executeTool(tool, JSON.stringify(args))) as {
      content: { text: string }[]
      structuredContent?: Record<string, unknown>
      isError?: boolean
    }
  }, [name, input] as const)
}

interface TrackedDocument extends Document {
  __bookhandTracked?: Set<EventListenerOrEventListenerObject>
  __bookhandSignalTracked?: Set<EventListenerOrEventListenerObject>
  __bookhandTrackedByType?: Map<string, Set<EventListenerOrEventListenerObject>>
}

async function instrumentCurrentDocumentListeners(page: Page) {
  await page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    const doc = view.renderer?.getContents?.()[0]?.doc as TrackedDocument | undefined
    if (!doc) throw new Error('Foliate document is unavailable')

    const tracked = new Set<EventListenerOrEventListenerObject>()
    const signalTracked = new Set<EventListenerOrEventListenerObject>()
    const trackedByType = new Map<string, Set<EventListenerOrEventListenerObject>>()
    const originalAdd = doc.addEventListener.bind(doc)
    const originalRemove = doc.removeEventListener.bind(doc)
    doc.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions | boolean,
    ) => {
      tracked.add(listener)
      const entries = trackedByType.get(type) ?? new Set<EventListenerOrEventListenerObject>()
      entries.add(listener)
      trackedByType.set(type, entries)
      const signal = typeof options === 'object' ? options.signal : undefined
      if (signal) signalTracked.add(listener)
      signal?.addEventListener(
        'abort',
        () => {
          tracked.delete(listener)
          signalTracked.delete(listener)
          entries.delete(listener)
        },
        { once: true },
      )
      return originalAdd(type, listener, options)
    }) as typeof doc.addEventListener
    doc.removeEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: EventListenerOptions | boolean,
    ) => {
      tracked.delete(listener)
      signalTracked.delete(listener)
      trackedByType.get(type)?.delete(listener)
      return originalRemove(type, listener, options)
    }) as typeof doc.removeEventListener
    doc.__bookhandTracked = tracked
    doc.__bookhandSignalTracked = signalTracked
    doc.__bookhandTrackedByType = trackedByType
  })
}

async function openFixture(page: Page) {
  await page.goto('/')
  const fileInput = page.locator('input[type=file]')
  await expect(fileInput).toBeEnabled({ timeout: 20_000 })
  await fileInput.setInputFiles('tests/fixtures/epub/re001-direction-book.epub')
  const row = page.locator('.book-open', { hasText: 'RE-001 Direction Lifecycle Fixture' })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.click()
  await expect(page.locator('.reader')).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    return view?.renderer?.getContents?.()[0]?.doc?.body?.textContent?.length ?? 0
  })).toBeGreaterThan(20)
}

async function startSpineTurnPaintProbe(page: Page) {
  await page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: HTMLElement & { getContents?: () => { doc: Document }[] }
    }
    const renderer = view.renderer
    if (!renderer) throw new Error('Foliate renderer is unavailable')
    const probe = {
      blankFrames: [] as number[],
      compositorTransforms: [] as string[],
      until: performance.now() + 700,
    }
    ;(window as unknown as { __bookhandTurnProbe: typeof probe }).__bookhandTurnProbe = probe

    const hasVisibleBookText = () => {
      const content = renderer.getContents?.()[0]
      const doc = content?.doc
      const frame = doc?.defaultView?.frameElement
      if (!doc?.body || !(frame instanceof HTMLIFrameElement)) return false
      const frameRect = frame.getBoundingClientRect()
      if (
        frameRect.right <= 0
        || frameRect.bottom <= 0
        || frameRect.left >= window.innerWidth
        || frameRect.top >= window.innerHeight
      ) return false
      for (let node: Element | null = frame; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          return false
        }
      }
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
        },
      })
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        const range = doc.createRange()
        range.selectNodeContents(text)
        if (Array.from(range.getClientRects()).some((rect) =>
          rect.width > 0
          && rect.height > 0
          && rect.right > 0
          && rect.bottom > 0
          && rect.left < frame.clientWidth
          && rect.top < frame.clientHeight)) return true
      }
      return false
    }

    const sample = () => {
      const snapshotActive = document.documentElement.classList.contains('bookhand-spine-turn')
      const snapshotTransforms = document.getAnimations()
        .map((animation) => animation.effect)
        .filter((effect): effect is KeyframeEffect => effect instanceof KeyframeEffect)
        .filter((effect) => effect.pseudoElement?.includes('bookhand-spine-turn'))
        .map((effect) => getComputedStyle(document.documentElement, effect.pseudoElement!).transform)
        .filter((transform) => transform !== 'none')
      probe.compositorTransforms.push(...snapshotTransforms)
      if (!hasVisibleBookText() && !snapshotActive) {
        probe.blankFrames.push(Math.round(performance.now()))
      }
      if (performance.now() < probe.until) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
}

async function readSpineTurnPaintProbe(page: Page) {
  await page.waitForTimeout(700)
  return page.evaluate(() => (window as unknown as {
    __bookhandTurnProbe: { blankFrames: number[]; compositorTransforms: string[] }
  }).__bookhandTurnProbe)
}

function flattenToc(
  items: readonly { label: string; href?: string; children: readonly unknown[] }[],
): { label: string; href?: string; children: readonly unknown[] }[] {
  return items.flatMap((item) => [item, ...flattenToc(item.children as typeof items)])
}

type E2eTocItem = { label: string; href?: string; children: readonly E2eTocItem[] }

async function waitForTocLabel(page: Page, prefix: string): Promise<E2eTocItem[]> {
  await expect.poll(async () => {
    const result = await callSiteTool(page, 'get_table_of_contents')
    const toc = result.structuredContent?.tableOfContents as E2eTocItem[] | undefined
    return toc ? flattenToc(toc).some((item) => item.label.startsWith(prefix)) : false
  }, { timeout: 20_000 }).toBe(true)
  const result = await callSiteTool(page, 'get_table_of_contents')
  return result.structuredContent?.tableOfContents as E2eTocItem[]
}

test('retains the browsing context across mixed writing modes and bounds candidate listeners', async ({
  page,
}) => {
  await openFixture(page)
  await instrumentCurrentDocumentListeners(page)

  const initial = await page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    const content = view.renderer?.getContents?.()[0]
    if (!content) throw new Error('initial Foliate content is unavailable')
    const doc = content.doc
    const frameWindow = doc.defaultView
    if (!frameWindow) throw new Error('initial EPUB Window is unavailable')

    return { hasWindow: Boolean(frameWindow) }
  })

  // The actual assertions below use a page-side marker and the tracked
  // signal-backed registration count.
  expect(initial.hasWindow).toBe(true)

  const transitions = await page.evaluate(async () => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: EventTarget & {
        getContents?: () => { index: number; doc: Document }[]
        goTo?: (target: { index: number }) => Promise<void>
      }
    }
    const renderer = view.renderer
    const content = renderer?.getContents?.()[0]
    if (!renderer || !content?.doc || !renderer.goTo) throw new Error('Foliate renderer is unavailable')
    const doc = content.doc as TrackedDocument
    const frameWindow = doc.defaultView as Window & { __bookhandPersistentFrame?: string }
    frameWindow.__bookhandPersistentFrame = 'origin'

    const snapshots: { index: number; writingMode: string; sameWindow: boolean; signalListeners: number }[] = []
    for (const index of [1, 2, 1, 0]) {
      await renderer.goTo({ index })
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
      const next = renderer.getContents?.()[0]
      const nextWindow = next?.doc.defaultView as (Window & { __bookhandPersistentFrame?: string }) | null
      const body = next?.doc.body
      const tracked = doc.__bookhandSignalTracked
      snapshots.push({
        index: next?.index ?? -1,
        writingMode: next?.doc.defaultView?.getComputedStyle(body ?? next!.doc.documentElement).writingMode ?? '',
        sameWindow: nextWindow === frameWindow,
        signalListeners: tracked?.size ?? -1,
      })
    }
    return {
      snapshots,
      marker: (renderer.getContents?.()[0]?.doc.defaultView as Window & {
        __bookhandPersistentFrame?: string
      })?.__bookhandPersistentFrame,
    }
  })

  expect(transitions.marker).toBe('origin')
  expect(transitions.snapshots.map((snapshot) => snapshot.index)).toEqual([1, 2, 1, 0])
  expect(transitions.snapshots.map((snapshot) => snapshot.sameWindow)).toEqual([true, true, true, true])
  expect(transitions.snapshots.every((snapshot) => snapshot.signalListeners === 13)).toBe(true)
  expect(transitions.snapshots.map((snapshot) => snapshot.writingMode)).toEqual([
    'vertical-rl',
    'horizontal-tb',
    'vertical-rl',
    'horizontal-tb',
  ])
})

test('bounds retained-document link and overlay listeners through teardown', async ({ page }) => {
  await openFixture(page)
  await instrumentCurrentDocumentListeners(page)

  const result = await page.evaluate(async () => {
    const view = document.querySelector('foliate-view') as unknown as EventTarget & {
      close?: () => void
      addAnnotation?: (annotation: { value: string; color: string }) => Promise<unknown>
      getCFI?: (index: number, range: Range) => string
      renderer?: {
        getContents?: () => { index: number; doc: Document }[]
        goTo?: (target: { index: number }) => Promise<void>
      }
    }
    const renderer = view.renderer
    const original = renderer?.getContents?.()[0]?.doc as TrackedDocument | undefined
    if (!renderer?.goTo || !original) throw new Error('Foliate renderer is unavailable')

    const listenerCounts = () => ({
      click: original.__bookhandTrackedByType?.get('click')?.size ?? 0,
      mousemove: original.__bookhandTrackedByType?.get('mousemove')?.size ?? 0,
    })
    await renderer.goTo({ index: 1 })
    const firstLoad = listenerCounts()
    for (const index of [2, 1, 0, 2, 0]) await renderer.goTo({ index })
    const afterTransitions = listenerCounts()

    const doc = renderer.getContents?.()[0]?.doc
    if (!doc?.body) throw new Error('Current EPUB document is unavailable')
    const anchor = doc.createElement('a')
    anchor.href = '#h-one'
    anchor.textContent = 'Current fragment'
    doc.body.append(anchor)
    let linkEvents = 0
    view.addEventListener('link', (event) => {
      linkEvents += 1
      event.preventDefault()
    })
    anchor.click()

    const passage = doc.getElementById('h-one')
    const text = passage?.firstChild
    if (!passage || !text || !view.addAnnotation || !view.getCFI) {
      throw new Error('Annotation test seam is unavailable')
    }
    const range = doc.createRange()
    range.selectNodeContents(text)
    const annotationValue = view.getCFI(0, range)
    let annotationEvents = 0
    view.addEventListener('show-annotation', () => { annotationEvents += 1 })
    await view.addAnnotation({ value: annotationValue, color: 'yellow' })
    const rect = range.getBoundingClientRect()
    passage.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: rect.left + Math.min(2, rect.width / 2),
      clientY: rect.top + Math.min(2, rect.height / 2),
    }))

    view.close?.()
    return {
      firstLoad,
      afterTransitions,
      afterClose: listenerCounts(),
      linkEvents,
      annotationEvents,
    }
  })

  expect(result.firstLoad).toEqual({ click: 2, mousemove: 1 })
  expect(result.afterTransitions).toEqual(result.firstLoad)
  expect(result.linkEvents).toBe(1)
  expect(result.annotationEvents).toBe(1)
  expect(result.afterClose).toEqual({ click: 0, mousemove: 0 })
})

test('a cross-section link to an empty fragment reveals the following passage', async ({ page }) => {
  await openFixture(page)
  const link = page.frameLocator('foliate-view iframe').getByRole('link', {
    name: 'Open the empty fragment target',
  })
  await link.click()

  await expect.poll(() => page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    return Boolean(view.renderer?.getContents?.()[0]?.doc.getElementById('empty-fragment'))
  })).toBe(true)
  await expect.poll(async () => {
    const result = await callSiteTool(page, 'get_reading_context')
    const context = result.structuredContent?.readingContext as
      | { visible?: { text?: string } }
      | undefined
    return context?.visible?.text ?? ''
  }).toContain('Empty fragment destination passage.')
})

test('the normal page controls keep a painted page moving across a spine boundary', async ({ page }) => {
  await openFixture(page)
  await page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: HTMLElement & { getContents?: () => { doc: Document }[] }
    }
    const renderer = view.renderer
    const frameWindow = renderer?.getContents?.()[0]?.doc.defaultView as
      | (Window & { __bookhandAnimatedFrame?: string })
      | null
    if (!renderer || !frameWindow) throw new Error('Foliate renderer is unavailable')
    frameWindow.__bookhandAnimatedFrame = 'retained-animated-frame'
  })

  await startSpineTurnPaintProbe(page)
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect.poll(() => page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    return view.renderer?.getContents?.()[0]?.doc.body?.textContent ?? ''
  })).toContain('Vertical writing section')
  const forward = await readSpineTurnPaintProbe(page)
  expect(forward.blankFrames).toEqual([])
  expect(forward.compositorTransforms.length).toBeGreaterThan(1)

  await startSpineTurnPaintProbe(page)
  await page.getByRole('button', { name: 'Previous page' }).click()
  await expect.poll(() => page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    return view.renderer?.getContents?.()[0]?.doc.body?.textContent ?? ''
  })).toContain('First horizontal section')
  const backward = await readSpineTurnPaintProbe(page)
  expect(backward.blankFrames).toEqual([])
  expect(backward.compositorTransforms.length).toBeGreaterThan(1)

  const result = await page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    const frameWindow = view.renderer?.getContents?.()[0]?.doc.defaultView as
      | (Window & { __bookhandAnimatedFrame?: string })
      | null
    return {
      marker: frameWindow?.__bookhandAnimatedFrame ?? '',
    }
  })
  expect(result.marker).toBe('retained-animated-frame')
})

test('reanchors the named passage only when retained-view expansion runs', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeResizeObserver = window.ResizeObserver
    const records: {
      callback: ResizeObserverCallback
      observer: ResizeObserver
      targets: Set<Element>
    }[] = []
    const probe = {
      callbacks: 0,
      suppress: false,
      trigger(target: Element) {
        const record = records.find((candidate) => candidate.targets.has(target))
        if (!record) throw new Error('No ResizeObserver watches the retained EPUB body')
        if (probe.suppress) return
        probe.callbacks += 1
        record.callback([], record.observer)
      },
    }
    ;(window as unknown as { __bookhandResizeProbe: typeof probe }).__bookhandResizeProbe = probe
    const ResizeObserverProbe = function (callback: ResizeObserverCallback) {
      let observer: ResizeObserver
      observer = new NativeResizeObserver((entries) => {
        if (probe.suppress) return
        probe.callbacks += 1
        callback(entries, observer)
      })
      const targets = new Set<Element>()
      const nativeObserve = observer.observe.bind(observer)
      const nativeUnobserve = observer.unobserve.bind(observer)
      observer.observe = (target, options) => {
        targets.add(target)
        nativeObserve(target, options)
      }
      observer.unobserve = (target) => {
        targets.delete(target)
        nativeUnobserve(target)
      }
      records.push({ callback, observer, targets })
      return observer
    }
    ResizeObserverProbe.prototype = NativeResizeObserver.prototype
    window.ResizeObserver = ResizeObserverProbe as unknown as typeof ResizeObserver
  })
  await openFixture(page)

  const result = await page.evaluate(async () => {
    const view = document.querySelector('foliate-view') as unknown as EventTarget & {
      renderer?: EventTarget & {
        getContents?: () => { doc: Document }[]
        goTo?: (target: { index: number; anchor: (doc: Document) => Element | null }) => Promise<unknown>
      }
    }
    const renderer = view.renderer
    if (!renderer?.goTo) throw new Error('Foliate view is unavailable')
    await renderer.goTo({ index: 1, anchor: (doc) => doc.getElementById('v-one') })

    let relocations = 0
    let lastRelocation = performance.now()
    let lastRange: Range | undefined
    renderer.addEventListener('relocate', (event) => {
      relocations += 1
      lastRelocation = performance.now()
      lastRange = (event as CustomEvent<{ range?: Range }>).detail.range
    })
    const waitForQuiet = async (quietFor = 200) => {
      const deadline = performance.now() + 2_000
      while (performance.now() < deadline) {
        if (performance.now() - lastRelocation >= quietFor) return
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      throw new Error('Renderer did not settle')
    }
    // The counter-review demonstrated a preceding relocation arriving inside
    // a 500 ms window. Require a longer idle interval before starting the
    // expansion measurement so that event cannot satisfy this assertion.
    await waitForQuiet(750)

    const probe = (window as unknown as {
      __bookhandResizeProbe: {
        callbacks: number
        suppress: boolean
        trigger: (target: Element) => void
      }
    }).__bookhandResizeProbe
    const doc = renderer.getContents?.()[0]?.doc
    const passage = doc?.getElementById('v-one')
    if (!doc?.body || !passage) throw new Error('Named vertical passage is unavailable')
    const beforeGeometry = {
      width: doc.documentElement.scrollWidth,
      height: doc.documentElement.scrollHeight,
    }
    const beforeCallbacks = probe.callbacks
    const beforeRelocations = relocations
    const expansion = doc.createElement('div')
    expansion.textContent = 'late layout growth '.repeat(3_000)
    passage.before(expansion)
    const afterGeometry = {
      width: doc.documentElement.scrollWidth,
      height: doc.documentElement.scrollHeight,
    }
    probe.trigger(doc.body)
    await new Promise((resolve) => setTimeout(resolve, 300))
    await waitForQuiet()
    const positive = {
      callbacks: probe.callbacks - beforeCallbacks,
      relocations: relocations - beforeRelocations,
      semanticAnchor: lastRange?.commonAncestorContainer.textContent ?? '',
      geometryGrew:
        afterGeometry.width > beforeGeometry.width || afterGeometry.height > beforeGeometry.height,
    }

    expansion.remove()
    await waitForQuiet()
    probe.suppress = true
    const beforeSuppressedRelocations = relocations
    const suppressedExpansion = doc.createElement('div')
    suppressedExpansion.textContent = 'suppressed late layout growth '.repeat(3_000)
    passage.before(suppressedExpansion)
    probe.trigger(doc.body)
    await new Promise((resolve) => setTimeout(resolve, 500))
    const negativeControl = {
      relocations: relocations - beforeSuppressedRelocations,
    }
    return { positive, negativeControl }
  })

  expect(result.positive.callbacks).toBeGreaterThan(0)
  expect(result.positive.relocations).toBeGreaterThan(0)
  expect(result.positive.geometryGrew).toBe(true)
  expect(result.positive.semanticAnchor).toContain('Vertical writing section')
  expect(result.negativeControl.relocations).toBe(0)
})

test('does not restore page-control focus after deliberate destination-frame interaction', async ({
  page,
}) => {
  await openFixture(page)
  await page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { next?: () => Promise<unknown> }
    }
    const renderer = view.renderer
    if (!renderer?.next) throw new Error('Foliate renderer is unavailable')
    const originalNext = renderer.next.bind(renderer)
    let release: () => void = () => undefined
    const released = new Promise<void>((resolve) => { release = resolve })
    const gate = { destinationReady: false, release }
    ;(window as unknown as { __bookhandFocusGate: typeof gate }).__bookhandFocusGate = gate
    renderer.next = async () => {
      const result = await originalNext()
      gate.destinationReady = true
      await released
      return result
    }
  })

  const next = page.getByRole('button', { name: 'Next page' })
  await next.click()
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __bookhandFocusGate?: { destinationReady: boolean } })
      .__bookhandFocusGate?.destinationReady ?? false,
  )).toBe(true)

  await page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    const doc = view.renderer?.getContents?.()[0]?.doc
    if (!doc?.body) throw new Error('Destination EPUB document is unavailable')
    const button = doc.createElement('button')
    button.id = 'destination-action'
    button.textContent = 'Destination action'
    doc.body.prepend(button)
  })
  await page.frameLocator('foliate-view iframe').getByRole('button', {
    name: 'Destination action',
  }).click()
  await page.evaluate(() => {
    ;(window as unknown as { __bookhandFocusGate: { release: () => void } })
      .__bookhandFocusGate.release()
  })

  await expect.poll(() => page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    return view.renderer?.getContents?.()[0]?.doc.activeElement?.id ?? ''
  })).toBe('destination-action')
  await expect(next).not.toBeFocused()
})

test('a real same-section Flatland link lands on its named fragment', async ({ page }) => {
  await page.goto(process.env.RE001_EXTERNAL_URL ?? '/')
  const row = page.locator('.book-open', { hasText: 'Flatland' })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.click()
  await expect(page.locator('.reader')).toBeVisible()
  await expect.poll(() => page.evaluate(async () =>
    (await document.modelContext?.getTools())?.map((tool) => tool.name) ?? [],
  )).toContain('get_table_of_contents')

  const toc = await waitForTocLabel(page, 'Section 15.')
  const flattened = flattenToc(toc)
  const section15 = flattened.find((item) => item.label.startsWith('Section 15.'))
  const contents = flattened.find((item) => item.label === 'CONTENTS:')
  expect(section15?.href).toBeTruthy()
  expect(contents?.href).toBeTruthy()
  const navigated = await callSiteTool(page, 'navigate_book', { href: section15?.href })
  expect(navigated.isError).not.toBe(true)

  const locationLabel = () => page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      lastLocation?: { tocItem?: { label?: string } }
    }
    return view.lastLocation?.tocItem?.label ?? ''
  })
  await expect.poll(locationLabel).toContain('Section 15.')

  const frameIdentity = await page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    const frameWindow = view.renderer?.getContents?.()[0]?.doc.defaultView as
      | (Window & { __bookhandLinkFrame?: string })
      | null
    if (!frameWindow) throw new Error('Flatland frame is unavailable')
    frameWindow.__bookhandLinkFrame = 'retained-link-frame'
    return frameWindow.__bookhandLinkFrame
  })
  expect(frameIdentity).toBe('retained-link-frame')

  const link = page.frameLocator('foliate-view iframe').getByRole('link', {
    name: 'How I came to Spaceland, and what I saw there',
    exact: true,
  })
  await expect(link).toHaveCount(1)
  const linkBox = await link.boundingBox()
  const viewport = page.viewportSize()
  expect(linkBox).not.toBeNull()
  expect(viewport).not.toBeNull()
  const intersectsViewport = (box: NonNullable<typeof linkBox>) =>
    box.x + box.width > 0 &&
      box.y + box.height > 0 &&
      box.x < viewport!.width &&
      box.y < viewport!.height
  expect(intersectsViewport(linkBox!)).toBe(false)

  // The named link lives in Flatland's opening HTML contents, not in Section
  // 15. Put that actual book page on screen before treating activation as a
  // reader navigation assertion; locator visibility alone includes clipped
  // columns elsewhere in the same enormous XHTML spine item.
  await callSiteTool(page, 'navigate_book', { href: contents?.href })
  await link.scrollIntoViewIfNeeded()
  const visibleLinkBox = await link.boundingBox()
  expect(visibleLinkBox).not.toBeNull()
  expect(intersectsViewport(visibleLinkBox!)).toBe(true)
  await link.click()

  await expect.poll(locationLabel).toContain('Section 18.')
  await expect.poll(() => page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    return (view.renderer?.getContents?.()[0]?.doc.defaultView as
      | (Window & { __bookhandLinkFrame?: string })
      | null)?.__bookhandLinkFrame ?? ''
  })).toBe('retained-link-frame')
})

test('a real cross-section Relativity index link lands on its empty named fragment', async ({
  page,
}) => {
  await page.setViewportSize({ width: 874, height: 698 })
  await page.goto(process.env.RE001_EXTERNAL_URL ?? '/')
  const row = page.locator('.book-open', { hasText: 'Relativity' })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.click()
  await expect(page.locator('.reader')).toBeVisible()
  await expect.poll(() => page.evaluate(async () =>
    (await document.modelContext?.getTools())?.map((tool) => tool.name) ?? [],
  )).toContain('get_table_of_contents')

  const toc = await waitForTocLabel(page, 'INDEX')
  const index = flattenToc(toc).find((item) => item.label.startsWith('INDEX'))
  expect(index?.href).toBeTruthy()
  expect((await callSiteTool(page, 'navigate_book', { href: index?.href })).isError).not.toBe(true)

  await page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    const frameWindow = view.renderer?.getContents?.()[0]?.doc.defaultView as
      | (Window & { __bookhandRelativityFrame?: string })
      | null
    if (!frameWindow) throw new Error('Relativity frame is unavailable')
    frameWindow.__bookhandRelativityFrame = 'retained-relativity-frame'
  })

  const aberrationEntry = page
    .frameLocator('foliate-view iframe')
    .locator('p.indx')
    .filter({ hasText: 'Aberration' })
  const page49 = aberrationEntry.getByRole('link', { name: '49', exact: true }).first()
  await expect(page49).toHaveCount(1)
  await page49.scrollIntoViewIfNeeded()
  await page49.click()

  await expect.poll(() => page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    return Boolean(view.renderer?.getContents?.()[0]?.doc.getElementById('Page_49'))
  })).toBe(true)
  const targetGeometry = await page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      lastLocation?: { cfi?: string }
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    const doc = view.renderer?.getContents?.()[0]?.doc
    const target = doc?.getElementById('Page_49')
    const frame = doc?.defaultView?.frameElement
    if (!doc || !target || !(frame instanceof HTMLIFrameElement)) {
      throw new Error('Relativity Page_49 target is unavailable')
    }
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return target.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING
          && node.textContent?.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP
      },
    })
    const text = walker.nextNode()
    if (!text?.textContent) throw new Error('Relativity Page_49 following text is unavailable')
    const range = doc.createRange()
    range.setStart(text, 0)
    range.setEnd(text, Math.min(text.textContent.length, 20))
    const rect = range.getBoundingClientRect()
    const frameRect = frame.getBoundingClientRect()
    const left = frameRect.left + rect.left
    const top = frameRect.top + rect.top
    return {
      cfi: view.lastLocation?.cfi ?? '',
      onScreen:
        left + rect.width > 0
        && top + rect.height > 0
        && left < window.innerWidth
        && top < window.innerHeight,
    }
  })
  expect(targetGeometry.onScreen, targetGeometry.cfi).toBe(true)
  await expect.poll(() => page.evaluate(() => {
    const view = document.querySelector('foliate-view') as unknown as {
      renderer?: { getContents?: () => { doc: Document }[] }
    }
    return (view.renderer?.getContents?.()[0]?.doc.defaultView as
      | (Window & { __bookhandRelativityFrame?: string })
      | null)?.__bookhandRelativityFrame ?? ''
  })).toBe('retained-relativity-frame')
})

test('a publisher range round-trips after rewritten and original remaster views', async ({
  page,
}) => {
  await page.goto(process.env.RE001_EXTERNAL_URL ?? '/')
  const row = page.locator('.book-open', { hasText: 'Flatland' })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.click()
  await expect(page.locator('.reader')).toBeVisible()
  await expect.poll(() => page.evaluate(async () =>
    (await document.modelContext?.getTools())?.map((tool) => tool.name) ?? [],
  )).toContain('edit_section')

  const toc = await waitForTocLabel(page, 'Section 1.')
  const flattened = flattenToc(toc)
  const section1 = flattened.find((item) => item.label.startsWith('Section 1.'))
  expect(section1?.href).toBeTruthy()
  await callSiteTool(page, 'navigate_book', { href: section1?.href })

  const sourceResult = await callSiteTool(page, 'get_section_source')
  const source = sourceResult.structuredContent as {
    html?: string
    sectionIndex?: number
    sourceFingerprint?: string
  }
  const originalText = 'Imagine a vast sheet of paper'
  expect(source.html).toContain(originalText)
  const edited = await callSiteTool(page, 'edit_section', {
    sectionIndex: source.sectionIndex,
    sourceFingerprint: source.sourceFingerprint,
    edits: [{
      oldText: originalText,
      newText: 'Imagine a carefully restored sheet of paper',
    }],
    summary: 'Exercise source identity across remaster views',
  })
  expect(edited.isError).not.toBe(true)
  expect((await callSiteTool(page, 'set_section_view', { view: 'rewritten' })).isError).not.toBe(true)
  const rewrittenContext = (await callSiteTool(page, 'get_reading_context'))
    .structuredContent?.readingContext as { visible: { text: string } }
  expect(rewrittenContext.visible.text).toContain('carefully restored sheet of paper')
  expect((await callSiteTool(page, 'set_section_view', { view: 'original' })).isError).not.toBe(true)

  const contextResult = await callSiteTool(page, 'get_reading_context')
  const context = contextResult.structuredContent?.readingContext as {
    bookId: string
    visible: {
      text: string
      range: {
        startCfi: string
        endCfi: string
        cfi?: string
        sectionIndex: number
        textFingerprint: string
      }
    }
  }
  expect(context.visible.text).toContain(originalText)
  expect(context.visible.text).not.toContain('carefully restored sheet of paper')
  const passageResult = await callSiteTool(page, 'get_passage', { range: context.visible.range })
  expect(passageResult.isError).not.toBe(true)
  expect(passageResult.structuredContent?.passage).toMatchObject({
    range: context.visible.range,
  })

  const annotation = await callSiteTool(page, 'save_annotation', {
    bookId: context.bookId,
    range: context.visible.range,
    quote: context.visible.text,
    color: 'amber',
  })
  expect(annotation.isError).not.toBe(true)
})
