import type { BookCatalogEntry, StorageDiagnostics } from '../domain/index.ts'
import { authorLine, progressPercent, splitTitle } from '../library/progress.ts'
import {
  errorResult,
  textResult,
  withOutputSchema,
  type ToolDefinition,
  type ToolResult,
} from './model-context.ts'
import type { ToolCallReporter } from './useWebMcpTools.ts'

export interface LibraryToolOptions {
  readonly books: () => readonly BookCatalogEntry[]
  readonly diagnostics: () => StorageDiagnostics | undefined
  /** Resolves only after the first readable section has loaded. */
  readonly openBook: (entry: BookCatalogEntry) => Promise<void>
  readonly report: ToolCallReporter
}

/**
 * Offered from the moment the app loads, so an agent arriving at the library
 * can see what is here and open something, rather than finding no tools at all
 * until a person happens to open a book first.
 */
export function createLibraryTools(options: LibraryToolOptions): readonly ToolDefinition[] {
  const run = async (
    name: string,
    summary: string,
    body: () => Promise<ToolResult>,
  ): Promise<ToolResult> => {
    try {
      const result = await body()
      options.report({ name, summary, ...(result.isError ? { failed: true } : {}) })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'That did not work'
      options.report({ name, summary: message, failed: true })
      return errorResult(message)
    }
  }

  const tools: readonly Omit<ToolDefinition, 'outputSchema'>[] = [
    {
      name: 'list_books',
      description:
        "List the books in this person's local library, with how far through each one they are. Use this to find the book to open before reading anything.",
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () =>
        run('list_books', 'listed the library', async () => {
          const books = options.books()
          const mode = options.diagnostics()?.mode
          if (books.length === 0) {
            return textResult(
              'The library is empty. The person can add an EPUB with Open EPUB; books stay on their device.',
              { books: [], storageMode: mode ?? null },
            )
          }
          const lines = books.map((entry) => {
            const percent = progressPercent(entry)
            return `${entry.id} · ${splitTitle(entry.metadata).title} · ${authorLine(entry)} · ${
              percent === undefined ? 'not started' : `${percent}%`
            }`
          })
          return textResult(
            [`Storage: ${mode ?? 'unknown'}`, `${books.length} book(s):`, ...lines].join('\n'),
            {
              storageMode: mode ?? null,
              books: books.map((entry) => ({
                bookId: entry.id,
                title: splitTitle(entry.metadata).title,
                author: authorLine(entry),
                progressPercent: progressPercent(entry) ?? null,
              })),
            },
          )
        }),
    },
    {
      name: 'open_book',
      description:
        'Open one book so its reading tools become available. Supply exactly ONE selector: bookId from list_books OR a distinctive title fragment. Omit the other field entirely, not an empty placeholder or null. Minimal JSON: {"title":"Calculus"}. An ambiguous title opens nothing and returns bounded candidates; select a returned bookId instead of guessing.',
      inputSchema: {
        type: 'object',
        oneOf: [
          { required: ['bookId'], not: { required: ['title'] } },
          { required: ['title'], not: { required: ['bookId'] } },
        ],
        properties: {
          bookId: { type: 'string', description: 'An id returned by list_books.' },
          title: { type: 'string', description: 'Part of the title, matched case-insensitively.' },
        },
        additionalProperties: false,
      },
      execute: (input) =>
        run('open_book', 'opened a book', async () => {
          const books = options.books()
          const hasId = typeof input.bookId === 'string' && input.bookId.length > 0
          const hasTitle = typeof input.title === 'string' && input.title.trim().length > 0
          if (hasId === hasTitle) {
            throw new Error('Choose exactly one book selector: bookId or title.')
          }
          const wanted = hasTitle ? String(input.title).trim().toLowerCase() : undefined
          const matches = wanted
            ? books.filter((candidate) => candidate.metadata.title.toLowerCase().includes(wanted))
            : []
          if (matches.length > 1) {
            const candidates = matches
              .slice(0, 10)
              .map((candidate) => `${candidate.id} · ${splitTitle(candidate.metadata).title}`)
            return errorResult(
              `That title matches more than one book. Choose a bookId:\n${candidates.join('\n')}`,
              {
                code: 'ambiguous-title',
                candidates: matches.slice(0, 10).map((candidate) => ({
                  bookId: candidate.id,
                  title: splitTitle(candidate.metadata).title,
                })),
              },
            )
          }
          const entry = hasId
            ? books.find((candidate) => candidate.id === input.bookId)
            : matches[0]
          if (!entry) throw new Error('No book in the library matches that. Call list_books first.')
          await options.openBook(entry)
          return textResult(
            `Opened ${splitTitle(entry.metadata).title}. The reading and study tools are now available.`,
            { bookId: entry.id, title: splitTitle(entry.metadata).title },
          )
        }),
    },
  ]
  return tools.map((tool) =>
    withOutputSchema(tool, (message) =>
      options.report({ name: tool.name, summary: message, failed: true }),
    ),
  )
}
