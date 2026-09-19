import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { IndexState, SearchHit, SearchResult } from '../domain/search.ts'

export function SearchPanel(props: {
  readonly indexState: IndexState | null
  readonly indexLoaded: boolean
  readonly indexing: boolean
  readonly onRetryIndex: () => void
  readonly onCancelIndex: () => void
  readonly onSearch: (query: string, limit: number) => Promise<SearchResult>
  readonly onActivate: (hit: SearchHit) => void
  readonly onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(5)
  const [result, setResult] = useState<SearchResult>()
  const [error, setError] = useState<string>()
  const [searching, setSearching] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const state = props.indexState
  const status = !props.indexLoaded
    ? 'Checking local search…'
    : state === null
      ? props.indexing ? 'Preparing local search…' : 'Search has not started'
    : state.status === 'complete'
      ? state.committedChunks === 0 ? 'Search ready · no text in this book' : 'Search ready'
      : state.status === 'failed'
        ? `Search paused · ${state.failure ?? 'indexing failed'}`
        : `Preparing search · ${state.sectionsIndexed} of ${state.sectionsTotal} sections`

  useEffect(() => heading.current?.focus(), [])

  return (
    <aside
      id="reader-search-panel"
      className="reader-panel search-panel"
      aria-labelledby="search-heading"
      data-index-state={!props.indexLoaded ? 'checking' : state?.status ?? (props.indexing ? 'partial' : 'not-started')}
    >
      <header className="panel-head">
        <div>
          <h2 id="search-heading" ref={heading} tabIndex={-1}>Search this book</h2>
          <p className="search-index-status" role="status" aria-live="polite">{status}</p>
        </div>
        <button type="button" className="button button-icon" aria-label="Close Search" onClick={props.onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="panel-body">
        <form className="search-form" onSubmit={(event) => {
          event.preventDefault()
          setError(undefined)
          setSearching(true)
          void props.onSearch(query, limit)
            .then(setResult, (cause) => setError(cause instanceof Error ? cause.message : 'Search failed.'))
            .finally(() => setSearching(false))
        }}>
        <label htmlFor="book-search-query">Words or phrase</label>
        <div className="search-input-row"><input id="book-search-query" value={query} maxLength={300} onChange={(event) => setQuery(event.target.value)} /><button className="button button-primary" type="submit" disabled={searching}><Search size={16} aria-hidden="true" />{searching ? 'Searching…' : 'Search'}</button></div>
        <label className="search-limit" htmlFor="book-search-limit">Results <input id="book-search-limit" type="number" min={1} max={10} value={limit} onChange={(event) => setLimit(Number(event.target.value))} /></label>
      </form>
        {props.indexing || state?.status === 'failed' || state?.status === 'partial' ? (
          <div className="search-index-actions">
            {state?.status === 'failed' || state?.status === 'partial' ? (
              <button type="button" className="button button-text" disabled={props.indexing} onClick={props.onRetryIndex}>
                {props.indexing ? 'Indexing…' : 'Resume indexing'}
              </button>
            ) : null}
            {props.indexing ? <button type="button" className="button button-text" onClick={props.onCancelIndex}>Pause indexing</button> : null}
          </div>
        ) : null}
        {error ? <p className="search-message" role="alert">{error}</p> : null}
        {result ? result.hits.length ? (
          <ol className="search-results">
            {result.hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  data-section-index={hit.sectionIndex}
                  onClick={() => props.onActivate(hit)}
                >
                  <span>{hit.sectionTitle}</span>
                  <q>{hit.text}</q>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="search-message" role="status">
            {result.availability === 'unavailable'
              ? 'Search is not ready yet. You can keep reading while it prepares.'
              : `No passages found for “${result.query}”.`}
          </p>
        ) : null}
      </div>
    </aside>
  )
}
