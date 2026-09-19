import { createHash } from 'node:crypto'
import { dirname, resolve as resolvePath } from 'node:path'

/**
 * Keep Foliate's paginator on one same-origin iframe.
 *
 * Browser-controlled ChatGPT tabs reject post-load `blob:` subframe
 * navigations. Foliate normally destroys its current iframe and points a new
 * one at a generated section blob on every chapter change. This compatibility
 * patch instead loads a same-origin empty frame once, fetches Foliate's local
 * blob in the parent, parses it with its declared MIME type, and replaces the
 * existing frame document in place.
 *
 * The dependency is pinned. Exact source matches make an upstream change fail
 * the build instead of silently restoring the blocked transport.
 */
export function foliatePersistentFrame() {
  return {
    name: 'bookhand-foliate-persistent-frame',
    enforce: 'pre',
    resolveId(source, importer) {
      // The candidate's browser PDF module retains the package build alias,
      // while its published archive ships the vendored module directly.
      // Resolve that exact candidate-only import without enabling a new
      // product surface or adding a runtime network dependency.
      if (source !== '@pdfjs/pdf.min.mjs' || !importer?.endsWith('/foliate-js/pdf.js')) return
      return resolvePath(dirname(importer), 'vendor/pdfjs/pdf.mjs')
    },
    transform(code, id) {
      const path = id.split('?', 1)[0].replaceAll('\\', '/')
      if (path.endsWith('/node_modules/foliate-js/view.js')) {
        const candidateViewDigest = createHash('sha256').update(code).digest('hex')
        const searchResultsField = '    #searchResults = new Map()'
        const originalOnLoad = `    #onLoad({ doc, index }) {
        // set language and dir if not already set
        doc.documentElement.lang ||= this.language.canonical ?? ''
        if (!this.language.isCJK)
            doc.documentElement.dir ||= this.language.direction ?? ''

        this.#handleLinks(doc, index)
        this.#cursorAutohider.cloneFor(doc.documentElement)

        this.#emit('load', { doc, index })
    }
    #handleLinks(doc, index) {`
        const persistentOnLoad = `    #onLoad({ doc, index }) {
        // The persistent-frame transport reuses one Document. Retire every
        // handler owned by the previous section before binding the new one.
        this.#documentEventController?.abort()
        this.#documentEventController = new AbortController()
        const { signal } = this.#documentEventController

        // set language and dir if not already set
        doc.documentElement.lang ||= this.language.canonical ?? ''
        if (!this.language.isCJK)
            doc.documentElement.dir ||= this.language.direction ?? ''

        this.#handleLinks(doc, index, signal)
        this.#cursorAutohider.cloneFor(doc.documentElement)

        this.#emit('load', { doc, index })
    }
    #handleLinks(doc, index, signal) {`
        const originalLinkEnd = `        })
    }
    async addAnnotation(annotation, remove) {`
        const persistentLinkEnd = `        }, { signal })
    }
    async addAnnotation(annotation, remove) {`
        const originalOverlayClickEnd = `        }, false)

        let lastHitTestTime = 0`
        const persistentOverlayClickEnd = `        }, { signal: this.#documentEventController.signal })

        let lastHitTestTime = 0`
        const originalOverlayMouseEnd = `            }
        })

        const list = this.#searchResults.get(index)`
        const persistentOverlayMouseEnd = `            }
        }, { signal: this.#documentEventController.signal })

        const list = this.#searchResults.get(index)`
        const originalCloseStart = `    close() {
        this.renderer?.destroy()`
        const persistentCloseStart = `    close() {
        this.#documentEventController?.abort()
        this.#documentEventController = null
        this.renderer?.destroy()`
        const needles = [
          searchResultsField,
          originalOnLoad,
          originalLinkEnd,
          originalOverlayClickEnd,
          originalOverlayMouseEnd,
          originalCloseStart,
        ]
        if (
          candidateViewDigest !== '2ec37eb49afdad6e319554feb088f19cfca3697544da0f0b81096573f617c72b' ||
          needles.some((needle) => !code.includes(needle))
        ) {
          throw new Error('Pinned Foliate view changed; document-event patch was not applied')
        }
        return {
          code: code
            .replace(
              searchResultsField,
              `${searchResultsField}\n    #documentEventController = null`,
            )
            .replace(originalOnLoad, persistentOnLoad)
            .replace(originalLinkEnd, persistentLinkEnd)
            .replace(originalOverlayClickEnd, persistentOverlayClickEnd)
            .replace(originalOverlayMouseEnd, persistentOverlayMouseEnd)
            .replace(originalCloseStart, persistentCloseStart),
          map: null,
        }
      }
      if (!path.endsWith('/node_modules/foliate-js/paginator.js')) return

      const iframeField = "    #iframe = document.createElement('iframe')"
      const constructorEnd = "        this.#iframe.setAttribute('scrolling', 'no')"
      const loadStart = '    async load(src, data, afterLoad, beforeRender) {'
      const loadEnd = '    render(layout) {'
      const loadStartIndex = code.indexOf(loadStart)
      const loadEndIndex = code.indexOf(loadEnd, loadStartIndex)
      const candidateLoad = loadStartIndex >= 0 && loadEndIndex >= 0
        ? code.slice(loadStartIndex, loadEndIndex)
        : ''
      const candidateLoadDigest = createHash('sha256').update(candidateLoad).digest('hex')
      const bodyStart = candidateLoad.indexOf('                const doc = this.document\n')
      const bodyEnd = candidateLoad.indexOf('            }, { once: true })', bodyStart)
      const candidateLoadBody = candidateLoad.slice(
        bodyStart + '                const doc = this.document\n'.length,
        bodyEnd,
      )
        .replace('\n                resolve()\n', '\n')
        .replaceAll('return resolve()', 'return')
        // The fork clears each section body so its multi-view paginator can
        // paint per-section backgrounds outside the frames. Bookhand disables
        // multi-view rendering, so retain the document background expected by
        // its themes and accessibility checks.
        .replace("                doc.body.style.background = 'none'\n", '')
      const originalDocumentTouchListeners = `        this.addEventListener('load', ({ detail: { doc } }) => {
            doc.addEventListener('touchstart', this.#onTouchStart.bind(this), opts)
            doc.addEventListener('touchmove', this.#onTouchMove.bind(this), opts)
            doc.addEventListener('touchend', this.#onTouchEnd.bind(this))
            doc.addEventListener('touchcancel', this.#onTouchCancel.bind(this))
        })`
      const persistentDocumentTouchListeners = `        this.addEventListener('load', ({ detail: { doc } }) => {
            this.#documentInputController?.abort()
            this.#documentInputController = new AbortController()
            const { signal } = this.#documentInputController
            doc.addEventListener('touchstart', this.#onTouchStart.bind(this), { ...opts, signal })
            doc.addEventListener('touchmove', this.#onTouchMove.bind(this), { ...opts, signal })
            doc.addEventListener('touchend', this.#onTouchEnd.bind(this), { signal })
            doc.addEventListener('touchcancel', this.#onTouchCancel.bind(this), { signal })
        })`
      const originalDocumentSelectionListeners = `        this.addEventListener('load', ({ detail: { doc } }) => {
            let isPointerSelecting = false
            doc.addEventListener('pointerdown', () => isPointerSelecting = true)
            doc.addEventListener('pointerup', () => isPointerSelecting = false)
            let isKeyboardSelecting = false
            doc.addEventListener('keydown', () => isKeyboardSelecting = true)
            doc.addEventListener('keyup', () => isKeyboardSelecting = false)
            doc.addEventListener('selectionchange', () => {
                if (this.scrolled) return
                const range = this.#lastVisibleRange
                if (!range) return
                const sel = doc.getSelection()
                if (!sel.rangeCount) return
                // FIXME: this won't work on Android WebView, disable for now
                if (!isPointerSelecting && isPointerSelecting && sel.type === 'Range')
                    checkPointerSelection(range, sel)
                else if (isKeyboardSelecting) {
                    const selRange = sel.getRangeAt(0).cloneRange()
                    const backward = selectionIsBackward(sel)
                    if (!backward) selRange.collapse()
                    this.#scrollToAnchor(selRange)
                }
            })
            doc.addEventListener('focusin', e => {
                if (this.scrolled) return null
                if (this.#container && this.#container.contains(e.target)) {
                    // NOTE: \`requestAnimationFrame\` is needed in WebKit
                    requestAnimationFrame(() => this.#scrollToAnchor(e.target))
                }
            })
        })`
      const persistentDocumentSelectionListeners = `        this.addEventListener('load', ({ detail: { doc } }) => {
            const { signal } = this.#documentInputController
            let isPointerSelecting = false
            doc.addEventListener('pointerdown', () => isPointerSelecting = true, { signal })
            doc.addEventListener('pointerup', () => isPointerSelecting = false, { signal })
            let isKeyboardSelecting = false
            doc.addEventListener('keydown', () => isKeyboardSelecting = true, { signal })
            doc.addEventListener('keyup', () => isKeyboardSelecting = false, { signal })
            doc.addEventListener('selectionchange', () => {
                if (this.scrolled) return
                const range = this.#lastVisibleRange
                if (!range) return
                const sel = doc.getSelection()
                if (!sel.rangeCount) return
                // FIXME: this won't work on Android WebView, disable for now
                if (!isPointerSelecting && isPointerSelecting && sel.type === 'Range')
                    checkPointerSelection(range, sel)
                else if (isKeyboardSelecting) {
                    const selRange = sel.getRangeAt(0).cloneRange()
                    const backward = selectionIsBackward(sel)
                    if (!backward) selRange.collapse()
                    this.#scrollToAnchor(selRange)
                }
            }, { signal })
            doc.addEventListener('focusin', e => {
                if (this.scrolled) return null
                if (this.#container && this.#container.contains(e.target)) {
                    // NOTE: \`requestAnimationFrame\` is needed in WebKit
                    requestAnimationFrame(() => {
                        if (signal.aborted || doc !== this.#primaryView?.document) return
                        this.#scrollToAnchor(e.target)
                    })
                }
            }, { signal })
        })`
      const persistentLoad = `    async load(src, data, afterLoad, beforeRender) {
        if (typeof src !== 'string') throw new Error(\`\${src} is not string\`)
        const response = await fetch(src)
        if (!response.ok) throw new Error(\`Could not read EPUB section: \${response.status}\`)
        const source = data ? await data : await response.text()
        const contentType = response.headers.get('content-type') ?? ''
        const parserType = contentType.includes('xhtml')
            ? 'application/xhtml+xml'
            : 'text/html'
        const parsed = new DOMParser().parseFromString(source, parserType)
        if (parsed.querySelector('parsererror')) throw new Error('Could not parse EPUB section')

        await this.#frameReady
        const previous = this.document
        if (previous?.body) this.#observer.unobserve(previous.body)
        const root = previous.importNode(parsed.documentElement, true)
        previous.replaceChild(root, previous.documentElement)
        const doc = this.document
${candidateLoadBody}
        const loads = Number(this.container.getAttribute('data-bookhand-frame-loads') ?? 0)
        this.container.setAttribute('data-bookhand-frame-transport', 'persistent-same-origin')
        this.container.setAttribute('data-bookhand-frame-loads', String(loads + 1))
    }`
      const originalCreateView = `    #createView(index) {
        // Destroy existing view for this index if any
        const existing = this.#views.get(index)
        if (existing) {
            existing.destroy()
            this.#container.removeChild(existing.element)
            this.#views.delete(index)
        }
        const view = new View({
            container: this,
            onExpand: () => {
                // Only the primary view's resize should adjust scroll;
                // non-primary views (preloaded/adjacent) must not scroll
                if (this.#filling || this.#stabilizing || this.scrolled) return
                if (this.#primaryIndex === index)
                    this.#scrollToAnchor(this.#anchor)
            },
        })
        this.#views.set(index, view)
        const sorted = this.#sortedViews
        const myPos = sorted.findIndex(([i]) => i === index)
        const nextEntry = sorted[myPos + 1]
        if (nextEntry) this.#container.insertBefore(view.element, nextEntry[1].element)
        else this.#container.append(view.element)
        this.#syncA11y()
        return view
    }`
      const persistentCreateView = `    #createView(index) {
        const current = this.#views.entries().next().value
        if (current) {
            const [currentIndex, view] = current
            this.#views.delete(currentIndex)
            this.#views.set(index, view)
            this.#syncA11y()
            return view
        }
        const view = new View({
            container: this,
            onExpand: () => {
                if (this.#filling || this.#stabilizing || this.scrolled) return
                if (this.#primaryView === view)
                    this.#scrollToAnchor(this.#anchor)
            },
        })
        this.#views.set(index, view)
        this.#container.append(view.element)
        this.#syncA11y()
        return view
    }`
      const originalOverlayer = `    set overlayer(overlayer) {
        this.#overlayer = overlayer
        this.#element.append(overlayer.element)
    }`
      const persistentOverlayer = `    set overlayer(overlayer) {
        this.#overlayer?.element.remove()
        this.#overlayer = overlayer
        this.#element.append(overlayer.element)
    }`
      const originalViewRetention = `                const keep = new Set([index])
                if (!this.noContinuousScroll) {
                    for (const [i] of this.#views) {
                        if (Math.abs(i - index) <= 2) keep.add(i)
                    }
                }
                this.#clearViewsExcept(keep)`
      const persistentViewRetention = `                const keep = new Set([index])
                if (this.noContinuousScroll) {
                    // Keep the sole View alive until #createView() rekeys it;
                    // this preserves the accepted iframe Window across sections.
                    keep.add(this.#primaryIndex)
                } else {
                    for (const [i] of this.#views) {
                        if (Math.abs(i - index) <= 2) keep.add(i)
                    }
                }
                this.#clearViewsExcept(keep)`
      const originalDirectionChange = `            if (directionChanged) {
                this.#destroyAllViews()
            } else {
                const keep = new Set([index])
                if (!this.noContinuousScroll) {
                    for (const [i] of this.#views) {
                        if (Math.abs(i - index) <= 2) keep.add(i)
                    }
                }
                this.#clearViewsExcept(keep)
            }`
      const persistentDirectionChange = `            if (directionChanged && this.noContinuousScroll) {
                // Bookhand retains one same-origin iframe across writing-mode changes.
                // The retained View is rekeyed by #createView() before it reloads
                // the parsed document, allowing #beforeRender() to update the
                // paginator direction and layout in place.
            } else if (directionChanged) {
                this.#destroyAllViews()
            } else {
                const keep = new Set([index])
                if (!this.noContinuousScroll) {
                    for (const [i] of this.#views) {
                        if (Math.abs(i - index) <= 2) keep.add(i)
                    }
                }
                this.#clearViewsExcept(keep)
            }`
      const originalDestroyDocumentInput = `        this.#observer.unobserve(this)
        this.#destroyAllViews()`
      const persistentDestroyDocumentInput = `        this.#observer.unobserve(this)
        this.#documentInputController?.abort()
        this.#documentInputController = null
        this.#destroyAllViews()`

      const originalRender = `    render(layout) {
        if (!layout || !this.document?.documentElement) return
        this.#column = layout.flow !== 'scrolled'
        this.#layout = layout
        if (this.#column) this.columnize(layout)
        else this.scrolled(layout)
    }`
      const originalNoContinuousScroll = `    get noContinuousScroll() {
        return this.scrolled && this.hasAttribute('no-continuous-scroll')
    }`
      const discreteNoContinuousScroll = `    get noContinuousScroll() {
        return this.hasAttribute('no-continuous-scroll')
    }`
      const persistentRender = `    render(layout) {
        if (!layout || !this.document?.documentElement) return
        // Bookhand can replace a mounted section body without navigating this
        // iframe. DOM Range mutation rules leave the old measurement range at
        // the removal boundary, so rebind it before every pagination pass.
        this.#contentRange.selectNodeContents(this.document.body)
        this.#column = layout.flow !== 'scrolled'
        this.#layout = layout
        if (this.#column) this.columnize(layout)
        else this.scrolled(layout)
    }`
      const originalUncollapse = `const uncollapse = range => {
    if (!range?.collapsed) return range
    const { endOffset, endContainer } = range
    if (endContainer.nodeType === 1) {
        const node = endContainer.childNodes[endOffset]
        if (node?.nodeType === 1) return node
        return endContainer
    }
    if (endOffset + 1 < endContainer.length) range.setEnd(endContainer, endOffset + 1)
    else if (endOffset > 1) range.setStart(endContainer, endOffset - 1)
    else return endContainer.parentNode
    return range
}`
      const fragmentSafeUncollapse = `const uncollapse = range => {
    if (!range?.collapsed) {
        // Empty publisher fragment markers can have no usable box. Keep their
        // semantic identity as #anchor, but measure the first following text
        // range so navigation lands on the page the marker names.
        if (range?.nodeType !== 1) return range
        const rects = Array.from(range.getClientRects?.() ?? [])
        if (rects.some(rect => rect.width > 0 && rect.height > 0)) return range
        const doc = range.ownerDocument
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
        walker.currentNode = range
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.nodeValue?.trim()) continue
            const fallback = doc.createRange()
            fallback.selectNodeContents(node)
            if (Array.from(fallback.getClientRects())
                .some(rect => rect.width > 0 && rect.height > 0)) return fallback
        }
        return range
    }
    const { endOffset, endContainer } = range
    if (endContainer.nodeType === 1) {
        const node = endContainer.childNodes[endOffset]
        if (node?.nodeType === 1) return node
        return endContainer
    }
    if (endOffset + 1 < endContainer.length) range.setEnd(endContainer, endOffset + 1)
    else if (endOffset > 1) range.setStart(endContainer, endOffset - 1)
    else return endContainer.parentNode
    return range
}`

      const needles = [
        iframeField,
        constructorEnd,
        candidateLoadDigest === '44be277dd7c2466d7320f83953250e2a5f58b868809044c84110edeb431aa99d'
          ? candidateLoad
          : '__missing-candidate-load__',
        originalRender,
        originalUncollapse,
        originalNoContinuousScroll,
        originalCreateView,
        originalOverlayer,
        originalViewRetention,
        originalDirectionChange,
        originalDocumentTouchListeners,
        originalDocumentSelectionListeners,
        originalDestroyDocumentInput,
      ]
      if (needles.some((needle) => !code.includes(needle))) {
        throw new Error('Pinned Foliate paginator changed; persistent-frame patch was not applied')
      }

      return {
        code: code
          .replace(iframeField, `${iframeField}\n    #frameReady`)
          .replace(
            constructorEnd,
            `${constructorEnd}\n        this.#frameReady = new Promise((resolve, reject) => {\n            this.#iframe.addEventListener('load', resolve, { once: true })\n            this.#iframe.addEventListener('error', reject, { once: true })\n        })\n        this.#iframe.src = new URL('reader-frame.html', document.baseURI).href`,
          )
          .replace(candidateLoad, persistentLoad)
          .replace(originalRender, persistentRender)
          .replace(originalUncollapse, fragmentSafeUncollapse)
          .replace(originalNoContinuousScroll, discreteNoContinuousScroll)
          .replace(originalCreateView, persistentCreateView)
          .replace(originalOverlayer, persistentOverlayer)
          .replace(originalDirectionChange, persistentDirectionChange)
          .replace(originalViewRetention, persistentViewRetention)
          .replace(originalDocumentTouchListeners, persistentDocumentTouchListeners)
          .replace(originalDocumentSelectionListeners, persistentDocumentSelectionListeners)
          .replace(originalDestroyDocumentInput, persistentDestroyDocumentInput)
          .replace(
            "    #primaryIndex = -1\n",
            "    #primaryIndex = -1\n    #documentInputController = null\n",
          ),
        map: null,
      }
    },
  }
}
