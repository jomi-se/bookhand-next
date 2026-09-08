import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { BookCatalogEntry } from './domain/index.ts'
import './library/library.css'
import './reader/reader.css'
import './study/study.css'
import { LibraryScreen } from './library/LibraryScreen.tsx'
import { useLibrary } from './library/useLibrary.ts'
import { ReaderScreen } from './reader/ReaderScreen.tsx'
import { createAppRuntime } from './app/runtime.ts'
import type { BookhandCommands } from './app/commands.ts'
import {
  readCoarsePointer,
  readViewportClass,
  summarizePresentation,
} from './webmcp/design-context.ts'
import { createDesignContextTool } from './webmcp/design-context-tool.ts'
import { createLibraryTools } from './webmcp/library-tools.ts'
import { createBookhandTools } from './webmcp/tools.ts'
import { useWebMcpTools, type ToolCallReporter } from './webmcp/useWebMcpTools.ts'
import { AiConnectionStore } from './ai/connection.ts'
import {
  inspectPendingAiReturn,
  type PendingAiReturnStatus,
} from './ai/pending-intent.ts'

/**
 * The tools whose calls change how something looks. `get_design_context`
 * reports these so an agent knows what is actually reachable right now rather
 * than inferring it from the surface it happens to be on.
 */
const DESIGN_BEARING_TOOLS = new Set([
  'set_reading_style',
  'upsert_study_item',
  'create_study_lesson',
  'set_study_board_view',
])

function App() {
  const runtime = useMemo(() => createAppRuntime(), [])
  const aiConnection = useMemo(() => new AiConnectionStore(), [])
  const library = useLibrary({ client: runtime.client, ports: runtime.ports })
  const [reading, setReading] = useState<BookCatalogEntry>()
  const [readerCommands, setReaderCommands] = useState<BookhandCommands>()
  const [pendingAiReturn, setPendingAiReturn] = useState<PendingAiReturnStatus | undefined>(() =>
    inspectPendingAiReturn(),
  )
  const pendingAiIntent = pendingAiReturn?.kind === 'owned'
    && pendingAiReturn.intent.feature === 'tutor'
    ? pendingAiReturn.intent
    : undefined
  const readingRef = useRef(reading)
  const agentOpenPending = useRef(false)
  const pendingReaderCommands = useRef<BookhandCommands | undefined>(undefined)
  readingRef.current = reading

  const books = library.books
  const diagnostics = library.diagnostics
  useEffect(() => {
    if (!pendingAiIntent || reading) return
    const entry = books.find((book) => book.id === pendingAiIntent.bookId)
    if (entry) setReading(entry)
  }, [books, pendingAiIntent, reading])

  const publishReaderCommands = useCallback((commands: BookhandCommands | undefined) => {
    if (agentOpenPending.current) {
      pendingReaderCommands.current = commands
      return
    }
    setReaderCommands(commands)
  }, [])

  const openBookForAgent = useCallback(async (entry: BookCatalogEntry) => {
    const previous = runtime.reader.adapter
    const alreadySelected = readingRef.current?.id === entry.id
    if (alreadySelected && previous) {
      try {
        previous.getLocation()
        return
      } catch {
        // The visible reader is still opening; wait on the same readiness
        // condition below instead of claiming success from React state alone.
      }
    } else if (!alreadySelected) setReading(entry)

    agentOpenPending.current = true
    pendingReaderCommands.current = undefined

    const deadline = Date.now() + 10_500
    while (Date.now() < deadline) {
      const adapter = runtime.reader.adapter
      // Switching books must wait for the old adapter to detach. React state
      // names the requested book before that happens, so identity—not the
      // selected row—is the readiness proof here.
      if (adapter && (alreadySelected || adapter !== previous)) {
        try {
          adapter.getLocation()
          // Changing the registered tool set while Chromium is still awaiting
          // `open_book` aborts the call that caused the change. Publish the
          // book tools on the following task, after this result has crossed
          // the WebMCP boundary.
          globalThis.setTimeout(() => {
            agentOpenPending.current = false
            setReaderCommands(pendingReaderCommands.current)
          }, 0)
          return
        } catch {
          // Foliate has mounted but its first section is not readable yet.
        }
      }
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 50))
    }
    globalThis.setTimeout(() => {
      agentOpenPending.current = false
      pendingReaderCommands.current = undefined
      setReaderCommands(undefined)
    }, 0)
    throw new Error('The book did not become readable. Try opening it again or use a new browser tab.')
  }, [runtime.reader])

  // The design context and library tools are offered from first load, so an
  // agent arriving at the library can see what is here, open something, and
  // find out how to compose inside it. A book's own tools join them once it is
  // open. The design context reads live state through the runtime store rather
  // than through props, so changing the text size does not re-register the
  // whole tool set.
  const designState = runtime.designState
  const createTools = useCallback(
    (report: ToolCallReporter) => {
      const bookTools = readerCommands
        ? createBookhandTools({ commands: readerCommands, onCall: report })
        : []
      const designBearing = bookTools
        .map((tool) => tool.name)
        .filter((name) => DESIGN_BEARING_TOOLS.has(name))
      return [
        createDesignContextTool({
          report,
          state: () => {
            const reader = designState.current
            // One store, so this is what the book is showing whoever changed
            // it last. Reported only while a book is open; before that there
            // is no presentation to describe, and inventing one would be worse
            // than saying so.
            const style = readerCommands ? runtime.presentation.visible : undefined
            return {
              activeSurface: reader?.surface ?? 'library',
              viewport: readViewportClass(),
              coarsePointer: readCoarsePointer(),
              mutationTools: designBearing,
              ...(style ? { presentation: summarizePresentation(style) } : {}),
              ...(reader?.boardView ? { boardView: reader.boardView } : {}),
            }
          },
        }),
        ...createLibraryTools({
          books: () => books,
          diagnostics: () => diagnostics,
          openBook: openBookForAgent,
          report,
        }),
        ...bookTools,
      ]
    },
    [books, designState, diagnostics, openBookForAgent, readerCommands, runtime.presentation],
  )

  const agent = useWebMcpTools({ createTools })
  const tutorTools = useMemo(() => reading && readerCommands?.bookId === reading.id
    ? createTools(() => {}).filter((tool) => tool.name !== 'open_book')
    : undefined, [createTools, readerCommands, reading])

  const exitReader = useCallback(() => {
    setReading(undefined)
    designState.clear()
    void library.refresh()
  }, [designState, library])
  const finishAiAuthorization = useCallback(() => setPendingAiReturn(undefined), [])

  if (reading) {
    return (
      <ReaderScreen
        // Keyed by book, so opening another one builds a fresh reader rather
        // than handing the new book the old book's adapter and study board.
        key={reading.id}
        entry={reading}
        client={runtime.client}
        ports={runtime.ports}
        bridge={runtime.reader}
        onExit={exitReader}
        onCommandsReady={publishReaderCommands}
        designState={designState}
        presentation={runtime.presentation}
        surface={runtime.surface}
        guidance={runtime.guidance}
        tutorTools={tutorTools}
        aiConnection={aiConnection}
        pendingAiIntent={pendingAiIntent}
        onAiAuthorizationFinished={finishAiAuthorization}
      />
    )
  }

  const invalidAiReturn = pendingAiReturn?.kind === 'invalid' ? pendingAiReturn : undefined
  const unsupportedAiReturn = pendingAiReturn?.kind === 'owned'
    && pendingAiReturn.intent.feature !== 'tutor' ? pendingAiReturn : undefined
  const missingAiBook = pendingAiIntent && library.phase === 'ready' && !library.bootstrapping
    && !books.some((book) => book.id === pendingAiIntent.bookId)
  const pendingDraft = (invalidAiReturn?.intent?.draft
    ?? unsupportedAiReturn?.intent.draft
    ?? pendingAiIntent?.draft)?.trim()
  const aiReturnNotice = invalidAiReturn
    ? `${invalidAiReturn.message}${pendingDraft ? ` Your draft is still here: “${pendingDraft}”` : ''}`
    : unsupportedAiReturn
      ? `This AI return targets a feature that is not available here.${pendingDraft ? ` Your draft is still here: “${pendingDraft}”` : ''} Dismiss it and connect again from that feature.`
      : missingAiBook
        ? `Tutor could not reopen the book for this return. Your draft is still here: ${pendingDraft ? `“${pendingDraft}”` : '(no question drafted)'}. Open the same EPUB to continue, or dismiss this return.`
        : undefined
  const dismissAiReturn = () => {
    aiConnection.dismissPendingAuthorization()
    setPendingAiReturn(undefined)
  }

  return (
    <LibraryScreen
      {...library}
      notice={aiReturnNotice ? {
        tone: 'failure',
        message: aiReturnNotice,
      } : library.notice}
      onOpenBook={setReading}
      onImportFile={(file) => void library.importFile(file)}
      onRetry={() => void library.retry()}
      onDismissNotice={aiReturnNotice ? dismissAiReturn : library.dismissNotice}
      agentStatus={agent.status}
    />
  )
}

export default App
