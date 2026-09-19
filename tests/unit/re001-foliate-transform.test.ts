import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-expect-error -- build-time compatibility transform is intentionally plain JS.
import { foliatePersistentFrame } from '../../scripts/vite-foliate-persistent-frame-plugin.mjs'

const paginatorPath = resolve(process.cwd(), 'node_modules/foliate-js/paginator.js')
const viewPath = resolve(process.cwd(), 'node_modules/foliate-js/view.js')

describe('RE-001 candidate persistent-frame transform', () => {
  it('applies only to the exact candidate paginator source shape', () => {
    const source = readFileSync(paginatorPath, 'utf8')
    const transformed = foliatePersistentFrame().transform(source, paginatorPath)

    expect(transformed?.code).toContain("new URL('reader-frame.html', document.baseURI).href")
    expect(transformed?.code).toContain("data-bookhand-frame-transport', 'persistent-same-origin'")
    expect(transformed?.code).toContain('const source = data ? await data : await response.text()')
    expect(transformed?.code).toContain("return this.hasAttribute('no-continuous-scroll')")
    expect(transformed?.code).not.toContain("return this.scrolled && this.hasAttribute('no-continuous-scroll')")
    expect(transformed?.code).toContain('const current = this.#views.entries().next().value')
    expect(transformed?.code).toContain('if (directionChanged && this.noContinuousScroll)')
    expect(transformed?.code).toContain('if (this.#primaryView === view)')
    expect(transformed?.code).toContain('this.#documentInputController?.abort()')
    expect(transformed?.code).toContain('{ ...opts, signal }')
    expect(transformed?.code).toContain('if (signal.aborted || doc !== this.#primaryView?.document) return')
    expect(transformed?.code).toContain('this.#documentInputController = null')
    expect(transformed?.code).toContain('this.#overlayer?.element.remove()')
    expect(transformed?.code).toContain('keep.add(this.#primaryIndex)')
    expect(transformed?.code).toContain('measure the first following text')
    expect(transformed?.code).toContain('walker.currentNode = range')
    expect(transformed?.code).not.toContain("doc.body.style.background = 'none'")
  })

  it('resolves the candidate PDF alias to its vendored module', () => {
    const plugin = foliatePersistentFrame()
    const resolved = plugin.resolveId?.(
      '@pdfjs/pdf.min.mjs',
      resolve(process.cwd(), 'node_modules/foliate-js/pdf.js'),
    )

    expect(resolved).toBe(resolve(process.cwd(), 'node_modules/foliate-js/vendor/pdfjs/pdf.mjs'))
  })

  it('bounds retained-document view listeners and aborts them on close', () => {
    const source = readFileSync(viewPath, 'utf8')
    const transformed = foliatePersistentFrame().transform(source, viewPath)

    expect(transformed?.code).toContain('this.#documentEventController?.abort()')
    expect(transformed?.code).toContain('this.#handleLinks(doc, index, signal)')
    expect(transformed?.code).toContain('}, { signal })')
    expect(transformed?.code).toContain('{ signal: this.#documentEventController.signal }')
    expect(transformed?.code).toContain('this.#documentEventController = null')
  })

  it('fails closed when the pinned view source drifts', () => {
    const source = readFileSync(viewPath, 'utf8')
    const drifted = source.replace('#handleLinks(doc, index)', '#handleLinks(doc, sectionIndex)')

    expect(() => foliatePersistentFrame().transform(drifted, viewPath)).toThrow(
      'Pinned Foliate view changed; document-event patch was not applied',
    )
  })

  it('fails closed when the pinned candidate source drifts', () => {
    const source = readFileSync(paginatorPath, 'utf8')
    const drifted = source.replace(
      "this.#iframe.setAttribute('scrolling', 'no')",
      "this.#iframe.setAttribute('scrolling', 'yes')",
    )

    expect(() => foliatePersistentFrame().transform(drifted, paginatorPath)).toThrow(
      'Pinned Foliate paginator changed; persistent-frame patch was not applied',
    )
  })
})
