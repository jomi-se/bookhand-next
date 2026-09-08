import type {
  BookRange,
  MutationReceipt,
  ReaderStyle,
  StudyItem,
  StudyItemPayload,
  StudyExperienceBlock,
} from '../domain/index.ts'
import { ANNOTATION_COLORS, STUDY_ITEM_KINDS } from '../domain/study.ts'
import type { BookhandCommands } from '../app/commands.ts'
import type { StudyBoardSnapshot } from '../app/commands.ts'
import type { StylePatch } from '../app/presentation.ts'
import {
  errorResult,
  quoteBookContent,
  textResult,
  withOutputSchema,
  type ToolDefinition,
  type ToolResult,
} from './model-context.ts'

export interface ToolCallRecord {
  readonly id: string
  readonly name: string
  readonly summary: string
  readonly at: string
  readonly failed?: boolean
}

export interface ToolHostOptions {
  readonly commands: BookhandCommands
  /** Every call is reported so the person can see what the agent did. */
  readonly onCall: (record: Omit<ToolCallRecord, 'id' | 'at'>) => void
}

const BOOK_ID_SCHEMA = {
  type: 'string',
  description:
    'The id of the book you are reading, from get_reading_context. Checked against the open book: a mutation naming a different book is rejected.',
} as const

const ACTION_GROUP_SCHEMA = {
  type: 'string',
  description:
    'Correlate writes from one intent for provenance. Existing blocks are undone one item at a time.',
} as const

const STABLE_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$'

const SECTION_INDEX_SCHEMA = {
  type: 'integer',
  minimum: 0,
  description: 'Defaults to the section the person is reading.',
} as const

function describeRefusals(sanitized: {
  readonly removedElements: Readonly<Record<string, number>>
  readonly removedAttributes: Readonly<Record<string, number>>
}): string {
  const visibleAttributes = Object.entries(sanitized.removedAttributes)
    .filter(([name]) => name !== 'xmlns' && !name.startsWith('xmlns:'))
  const parts = [
    ...Object.entries(sanitized.removedElements).map(([name, count]) => `${count} <${name}>`),
    ...visibleAttributes.map(([name, count]) => `${count} ${name}`),
  ]
  return parts.join(', ')
}

/** Every tool call is an agent acting; the interface is how a person acts. */
function caller(input: Record<string, unknown>) {
  return {
    origin: 'agent' as const,
    ...(typeof input.actionGroupId === 'string' ? { actionGroupId: input.actionGroupId } : {}),
  }
}

const RANGE_SCHEMA = {
  type: 'object',
  description: 'An exact source range previously returned by another Bookhand tool.',
  properties: {
    startCfi: { type: 'string' },
    endCfi: { type: 'string' },
    cfi: { type: 'string', description: 'The single range CFI spanning start to end.' },
    sectionIndex: { type: 'integer', minimum: 0 },
    textFingerprint: { type: 'string' },
  },
  required: ['startCfi', 'endCfi', 'sectionIndex', 'textFingerprint'],
  additionalProperties: false,
} as const

const STUDY_ITEM_COMMON_PROPERTIES = {
  id: {
    type: 'string',
    description:
      'Revise an existing block instead of adding one. You may only revise blocks you created, and must supply the updateToken you were given when you created it.',
  },
  updateToken: {
    type: 'string',
    description: 'The token returned when you created this block. Required to revise it.',
  },
  actionToken: {
    type: 'string',
    description:
      'Your own name for this action. Retrying with the same token and the same content returns the first result instead of writing twice.',
  },
  actionGroupId: {
    type: 'string',
    description: 'Correlate blocks from one intent for provenance. Each legacy block is undone separately.',
  },
  bookId: BOOK_ID_SCHEMA,
  sourceRange: RANGE_SCHEMA,
  sourceQuote: {
    type: 'string',
    maxLength: 32_000,
    description:
      'The exact text sourceRange covers. Required with sourceRange, and checked against the book, so a block can never cite words the book does not contain.',
  },
  sourceLabel: { type: 'string', maxLength: 500 },
} as const

const STUDY_ITEM_DEPENDENT_REQUIRED = {
  id: ['updateToken'],
  updateToken: ['id'],
  sourceRange: ['bookId', 'sourceQuote'],
  sourceQuote: ['bookId', 'sourceRange'],
} as const

/**
 * State the receipt back to the agent in the terms it needs to act on next.
 *
 * The update token is the only part that must be reported precisely, because
 * nothing will hand it over again. The reversal actions are named exactly as
 * the interface names them, so an agent describing what it did to the person
 * describes something the person can actually find on screen.
 */
function describeReceipt(receipt: MutationReceipt<StudyItem>): string {
  const lines = [
    `${receipt.operation === 'create' ? 'Added' : 'Revised'} ${receipt.applied.payload.kind} block ${receipt.applied.id} (revision ${receipt.applied.revision}).`,
    `Scope: ${receipt.scope}`,
    `Attributed to: ${receipt.origin}. Action group: ${receipt.actionGroupId}.`,
  ]
  if (receipt.updateToken) {
    lines.push(
      `updateToken: ${receipt.updateToken} — keep this; it is shown once and is the only way you can revise this block later.`,
    )
  }
  if (receipt.warnings.length > 0) lines.push(`Warnings: ${receipt.warnings.join(' ')}`)
  lines.push(
    `The person can: ${receipt.actions.map((action) => `${action.label} (${action.description})`).join(' ')}`,
  )
  return lines.join('\n')
}

/**
 * A style receipt in words. It states what it replaced, whether the change
 * survives a reload, and the reversals the person can actually see — so an
 * agent can describe what it did without guessing, and can put it back.
 */
function describeStyleReceipt(receipt: MutationReceipt<ReaderStyle>, verb: string): string {
  const lines = [
    `${verb}. Action group: ${receipt.actionGroupId}. Attributed to: ${receipt.origin}.`,
    `Scope: ${receipt.scope}`,
    `Was: ${summarizeStyle(receipt.prior)}`,
    `Now: ${summarizeStyle(receipt.applied)}`,
    receipt.persisted
      ? 'Saved, so it survives a reload.'
      : 'Showing now, but not saved — it will not survive a reload.',
  ]
  if (receipt.warnings.length > 0) lines.push(`Warnings: ${receipt.warnings.join(' ')}`)
  lines.push(
    `The person can: ${receipt.actions.map((action) => `${action.label} (${action.description})`).join(' ')}`,
  )
  return lines.join('\n')
}

function describeBoardReceipt(receipt: MutationReceipt<StudyBoardSnapshot>): string {
  const lines = [
    `The study board is ${receipt.applied.open ? 'on screen' : 'closed'}, laid out ${receipt.applied.view}.`,
    `Was: ${receipt.prior?.open ? 'on screen' : 'closed'}, laid out ${receipt.prior?.view}.`,
    `Scope: ${receipt.scope}`,
    receipt.persisted
      ? 'The layout preference was saved.'
      : 'The layout preference was not changed, so nothing was saved.',
    `Action group: ${receipt.actionGroupId}. Attributed to: ${receipt.origin}.`,
    `The person can: ${receipt.actions.map((action) => `${action.label} (${action.description})`).join(' ')}`,
  ]
  return lines.join('\n')
}

function summarizeStyle(style: ReaderStyle | undefined): string {
  if (!style) return 'unknown'
  return [
    `theme ${style.theme}`,
    `size ${style.fontSizePercent}%`,
    `line height ${style.lineHeight}`,
    `measure ${style.measureCh}ch`,
    `paragraph spacing ${style.paragraphSpacingEm}em`,
    `page layout ${style.pageLayout ?? 'auto'}`,
    style.customCss ? `${style.customCss.length} characters of book CSS` : 'no book CSS',
  ].join(', ')
}

function asRange(value: unknown): BookRange {
  const record = value as Record<string, unknown>
  if (
    typeof record?.startCfi !== 'string' ||
    typeof record?.endCfi !== 'string' ||
    typeof record?.textFingerprint !== 'string' ||
    !Number.isInteger(record?.sectionIndex)
  ) {
    throw new Error('range must come from a Bookhand tool result, unchanged')
  }
  return {
    startCfi: record.startCfi,
    endCfi: record.endCfi,
    ...(typeof record.cfi === 'string' ? { cfi: record.cfi } : {}),
    sectionIndex: record.sectionIndex as number,
    textFingerprint: record.textFingerprint,
  }
}

function describeRange(range: BookRange): string {
  return `section ${range.sectionIndex}, range ${range.cfi ?? range.startCfi}`
}

export function createBookhandTools(options: ToolHostOptions): readonly ToolDefinition[] {
  const { commands, onCall } = options

  const run = async (
    name: string,
    summary: (result: unknown) => string,
    body: () => Promise<ToolResult>,
  ): Promise<ToolResult> => {
    try {
      const result = await body()
      onCall({ name, summary: summary(result), ...(result.isError ? { failed: true } : {}) })
      return result
    } catch (error) {
      // Every refusal this product raises already carries the wording meant for
      // a person, including the ones that came back from the storage worker,
      // where the error class does not survive. The agent gets that same
      // wording, because it will repeat what it is told and what it repeats
      // should be something the person can act on.
      const message = error instanceof Error ? error.message : 'That did not work'
      onCall({ name, summary: message, failed: true })
      return errorResult(message)
    }
  }

  const tools: readonly Omit<ToolDefinition, 'outputSchema'>[] = [
    {
      name: 'get_reading_context',
      description:
        'Read where the person is in the book right now: the book and chapter, how far through they are, the passage currently visible, and their current text selection if any. Call this first to ground any help you give.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () =>
        run('get_reading_context', () => 'read the current page', async () => {
          const context = await commands.getReadingContext()
          const lines = [
            `Book: ${context.title}`,
            // Every source-linked mutation has to name the book. Saying it here
            // means an agent that grounded itself already has what it needs,
            // instead of having to go back to list_books for an id it was never
            // told.
            `Book id: ${context.bookId}`,
            `Chapter: ${context.chapterLabel ?? 'unknown'}`,
            `Section index: ${context.sectionIndex}`,
            `Progress: ${context.progressPercent}%`,
            '',
            quoteBookContent('Visible passage', context.visible.text),
            '',
            `Visible range: ${JSON.stringify(context.visible.range)}`,
          ]
          if (context.selection) {
            lines.push(
              '',
              quoteBookContent('Selected passage', context.selection.quote),
              '',
              `Selected range: ${JSON.stringify(context.selection.range)}`,
            )
          }
          lines.push(
            '',
            `Guidance: ${context.guidance.state}; Back ${context.guidance.canBack ? 'available' : 'unavailable'}; revision ${context.guidance.revision}.`,
          )
          return textResult(lines.join('\n'), { readingContext: context })
        }),
    },
    {
      name: 'get_table_of_contents',
      description:
        'List the book’s chapters and sections with the targets needed to navigate to them.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () =>
        run('get_table_of_contents', () => 'listed the contents', async () => {
          const flatten = (items: readonly { label: string; target: unknown; children: readonly unknown[] }[], depth = 0): string[] =>
            items.flatMap((item) => [
              `${'  '.repeat(depth)}- ${item.label} → ${JSON.stringify(item.target)}`,
              ...flatten(
                item.children as readonly { label: string; target: unknown; children: readonly unknown[] }[],
                depth + 1,
              ),
            ])
          const toc = commands.getTableOfContents()
          if (toc.length === 0) {
            return textResult('This book has no table of contents.', { tableOfContents: toc })
          }
          return textResult(
            quoteBookContent('Table of contents', flatten(toc as never).join('\n')),
            { tableOfContents: toc },
          )
        }),
    },
    {
      name: 'get_passage',
      description:
        'Re-read the exact text at a source range returned earlier. Use this to quote the book accurately instead of relying on memory.',
      inputSchema: {
        type: 'object',
        properties: { range: RANGE_SCHEMA },
        required: ['range'],
        additionalProperties: false,
      },
      execute: (input) =>
        run('get_passage', () => 'looked up a passage', async () => {
          const passage = await commands.getPassage(asRange(input.range))
          return textResult(
            [
              quoteBookContent('Passage', passage.text),
              '',
              `Breadcrumb: ${passage.chapterBreadcrumb.join(' › ')}`,
              `Range: ${JSON.stringify(passage.range)}`,
            ].join('\n'),
            { passage },
          )
        }),
    },
    {
      name: 'navigate_book',
      description:
        'Move the visible reader. Supply exactly ONE navigation selector: cfi, href, sectionIndex, or direction. Omit the other fields entirely, not empty placeholders or null. Minimal JSON examples: {"direction":"next"} or {"sectionIndex":3}. For exact locations, copy cfi from a Bookhand result or href from the table of contents; never invent either.',
      inputSchema: {
        type: 'object',
        oneOf: [
          { required: ['cfi'] },
          { required: ['href'] },
          { required: ['sectionIndex'] },
          { required: ['direction'] },
        ],
        properties: {
          cfi: { type: 'string', description: 'An exact CFI from a previous tool result.' },
          href: { type: 'string', description: 'A table-of-contents href.' },
          sectionIndex: { type: 'integer', minimum: 0 },
          direction: { type: 'string', enum: ['previous', 'next'] },
        },
        additionalProperties: false,
      },
      execute: (input) =>
        run('navigate_book', () => 'moved the reader', async () => {
          const selectors = ['cfi', 'href', 'sectionIndex', 'direction'].filter(
            (field) => input[field] !== undefined,
          )
          if (selectors.length !== 1) {
            return errorResult(
              'Choose exactly one navigation target: cfi, href, sectionIndex, or direction.',
            )
          }
          const target =
            typeof input.cfi === 'string' && input.cfi.trim().length > 0
              ? ({ kind: 'cfi', cfi: input.cfi } as const)
              : typeof input.href === 'string' && input.href.trim().length > 0
                ? ({ kind: 'href', href: input.href } as const)
                : Number.isInteger(input.sectionIndex) && Number(input.sectionIndex) >= 0
                  ? ({ kind: 'section', sectionIndex: input.sectionIndex as number } as const)
                  : input.direction === 'previous' || input.direction === 'next'
                    ? ({ kind: 'relative', direction: input.direction } as const)
                    : undefined
          if (!target) return errorResult('That navigation target is invalid.')
          const context = await commands.navigateBook(target)
          return textResult(
            `Now at ${context.chapterLabel ?? `section ${context.sectionIndex}`} (${context.progressPercent}%).`,
            { destination: context },
          )
        }),
    },
    {
      name: 'search_book',
      description:
        'Search the locally indexed text of the open book. This never scans the live EPUB, moves the reader, or changes the selection. Results include exact CFIs; call navigate_book separately only when the person wants to see one. Minimal JSON: {"query":"integration"}. Index unavailable means search is not ready, NOT that the book has no matches; partial results are not exhaustive. Use get_table_of_contents and get_reading_context to orient while indexing prepares.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 300, description: 'Words or a phrase containing at least one letter or number.' },
          limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
        },
        required: ['query'],
        additionalProperties: false,
      },
      execute: (input) =>
        run('search_book', (result) => `${(result as ToolResult).isError ? 'could not search' : 'searched this book'}`, async () => {
          if (typeof input.query !== 'string') return errorResult('query must be a string.')
          const limit = input.limit === undefined ? 5 : input.limit
          if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 10) {
            return errorResult('limit must be an integer from 1 to 10.')
          }
          const result = await commands.searchBook(input.query, Number(limit))
          const summary = result.hits.length
            ? result.hits.map((hit, index) => `${index + 1}. ${hit.sectionTitle}\n${quoteBookContent('Passage', hit.text)}\nRange: ${JSON.stringify({ startCfi: hit.startCfi, endCfi: hit.endCfi, sectionIndex: hit.sectionIndex, textFingerprint: hit.textFingerprint })}`).join('\n\n')
            : result.availability === 'unavailable'
              ? 'Local search is not ready yet. The person can keep reading while the index prepares.'
              : `No passages found for “${result.query}”.`
          const search = {
            ...result,
            hits: result.hits.map((hit) => ({
              ...hit,
              // The flat fields remain for navigation and compatibility; the
              // envelope makes search -> get/focus/save composition a direct
              // copy rather than a schema-transformation puzzle for an agent.
              range: {
                startCfi: hit.startCfi,
                endCfi: hit.endCfi,
                sectionIndex: hit.sectionIndex,
                textFingerprint: hit.textFingerprint,
              },
            })),
          }
          return textResult(`Availability: ${result.availability}. Outcome: ${result.outcome}.\n\n${summary}`, { search })
        }),
    },
    {
      name: 'focus_passage',
      description:
        'Temporarily guide the person to an exact passage returned by Bookhand. Pass the returned range object unchanged under `range` (the older flattened range fields remain accepted). This verifies the source, moves the visible reader, points at the exact words with a transient highlight, underline, or outline, and shows Back and Stop without creating an annotation, study block, or saved tutor state. Prefer a focused sentence or paragraph; broad visible ranges receive a calm block cue rather than dozens of fragment outlines. Use this to point at the book; use navigate_book for ordinary navigation.' +
        " Use either range OR the flattened sectionIndex/startCfi/endCfi/textFingerprint fields, never both. Prefer range copied unchanged; omit all flattened fields entirely. Always include bookId and the exact quote for that range.",
      inputSchema: {
        type: 'object',
        properties: {
          bookId: BOOK_ID_SCHEMA,
          range: RANGE_SCHEMA,
          sectionIndex: { type: 'integer', minimum: 0 },
          startCfi: { type: 'string', minLength: 1 },
          endCfi: { type: 'string', minLength: 1 },
          cfi: { type: 'string', minLength: 1 },
          textFingerprint: { type: 'string', minLength: 1 },
          quote: {
            type: 'string',
            minLength: 1,
            maxLength: 32_000,
            description: 'The complete exact text covered by this range.',
          },
          indicatorMessage: {
            type: 'string',
            maxLength: 1_000,
            description: 'A short plain-text explanation of why this passage is being shown.',
          },
          cue: {
            type: 'object',
            description: 'How Bookhand should point at the verified passage. Defaults to highlight.',
            properties: {
              kind: { type: 'string', enum: ['highlight', 'underline', 'outline'] },
            },
            required: ['kind'],
            additionalProperties: false,
          },
        },
        required: ['bookId', 'quote'],
        oneOf: [
          { required: ['range'] },
          { required: ['sectionIndex', 'startCfi', 'endCfi', 'textFingerprint'] },
        ],
        additionalProperties: false,
      },
      execute: (input) =>
        run('focus_passage', (value) => {
          const result = (value as ToolResult).structuredContent?.focus as { outcome?: string } | undefined
          return result?.outcome === 'applied' ? 'guided the reader to a passage' : 'could not guide the reader'
        }, async () => {
          const nestedRange = input.range && typeof input.range === 'object' && !Array.isArray(input.range)
            ? input.range as Record<string, unknown>
            : undefined
          const sourceRange = nestedRange ?? input
          const cue = input.cue
          if (
            cue !== undefined &&
            (!cue || typeof cue !== 'object' || Array.isArray(cue) ||
              !['highlight', 'underline', 'outline'].includes(String((cue as { kind?: unknown }).kind)) ||
              Object.keys(cue).some((key) => key !== 'kind'))
          ) return errorResult('cue must contain exactly one kind: highlight, underline, or outline.')
          const result = await commands.focusPassage({
            bookId: String(input.bookId ?? ''),
            sectionIndex: Number(sourceRange.sectionIndex),
            startCfi: String(sourceRange.startCfi ?? ''),
            endCfi: String(sourceRange.endCfi ?? ''),
            textFingerprint: String(sourceRange.textFingerprint ?? ''),
            quote: String(input.quote ?? ''),
            ...(typeof input.indicatorMessage === 'string'
              ? { indicatorMessage: input.indicatorMessage }
              : {}),
            ...(cue
              ? { cue: { kind: (cue as { kind: 'highlight' | 'underline' | 'outline' }).kind } }
              : {}),
          })
          const copy =
            result.outcome === 'applied'
              ? 'Showing that passage. The person can go Back or Stop guidance at any time.'
              : result.outcome === 'superseded'
                ? 'A newer reader action superseded this guidance.'
                : result.outcome === 'unavailable'
                  ? 'The reader is not ready for guidance yet.'
                  : 'detail' in result
                    ? result.detail
                    : 'That passage could not be shown.'
          return textResult(copy, { focus: result })
        }),
    },
    {
      name: 'control_guidance',
      description:
        'End temporary tutor guidance. Back returns to the one reading position from before guidance; Stop stays at the current passage. Both are safe to call repeatedly and never alter annotations, study material, or styles.',
      inputSchema: {
        type: 'object',
        properties: { action: { type: 'string', enum: ['back', 'stop'] } },
        required: ['action'],
        additionalProperties: false,
      },
      execute: (input) =>
        run('control_guidance', () => 'changed tutor guidance', async () => {
          if (input.action !== 'back' && input.action !== 'stop') {
            return errorResult('action must be back or stop.')
          }
          const result = await commands.controlGuidance(input.action)
          const copy =
            result.outcome === 'restored'
              ? 'Returned to the passage from before guidance.'
              : result.outcome === 'unresolvable'
                ? 'The earlier passage could not be restored. The reader remains where it is.'
                : result.outcome === 'no_back_target'
                  ? 'There is no earlier guidance passage to return to.'
                  : result.outcome === 'cleared' && result.wasActive
                    ? 'Stopped guidance and stayed at the current passage.'
                    : 'Guidance was already stopped.'
          return textResult(copy, { control: result })
        }),
    },
    {
      name: 'save_annotation',
      description:
        'Highlight a passage in the book and optionally attach a note. The highlight appears in the book and in the study board, is stored locally across reloads, belongs to the person, and remains removable by them.',
      inputSchema: {
        type: 'object',
        properties: {
          bookId: BOOK_ID_SCHEMA,
          range: RANGE_SCHEMA,
          quote: {
            type: 'string',
            maxLength: 32_000,
            description:
              'The exact text being highlighted, as returned by a Bookhand tool. It is compared against the text the range resolves to; only whitespace differences are forgiven.',
          },
          color: { type: 'string', enum: [...ANNOTATION_COLORS] },
          note: { type: 'string', maxLength: 20_000 },
        },
        required: ['bookId', 'range', 'quote'],
        additionalProperties: false,
      },
      execute: (input) =>
        run('save_annotation', () => 'highlighted a passage', async () => {
          const range = asRange(input.range)
          const saved = await commands.saveAnnotation({
            bookId: String(input.bookId ?? ''),
            range,
            quote: String(input.quote ?? ''),
            ...(typeof input.color === 'string'
              ? { color: input.color as (typeof ANNOTATION_COLORS)[number] }
              : {}),
            ...(typeof input.note === 'string' ? { note: input.note } : {}),
          })
          return textResult(`Highlighted ${describeRange(range)} as ${saved.id}.`, {
            annotation: saved,
          })
        }),
    },
    {
      name: 'set_reading_style',
      description:
        'Change how the book is presented: text size, line height, measure, paragraph spacing, page layout (auto, single, or spread), theme, or custom book CSS. Send only the fields you mean to change — anything you restate would overwrite a change the person made a moment ago. Spread remains one column on compact/coarse-pointer devices. Every change is reversible by the person with one action. Picking a shipped theme or adjusting size needs nothing else; custom CSS additionally requires designContextVersion from get_design_context, which explains the semantic roles, contrast floors, and what this CSS can and cannot reach.' +
        " Choose one operation: one or more style fields, undo:true alone, or reset:true alone. Omit unused fields entirely, including undo/reset; false or empty placeholders are not valid substitutes. Minimal JSON examples: {\"fontSizePercent\":120}, {\"undo\":true}, {\"reset\":true}. customCss must be accompanied by the current designContextVersion.",
      inputSchema: {
        type: 'object',
        oneOf: [
          {
            properties: { undo: { const: true } },
            required: ['undo'],
            not: {
              anyOf: [
                { required: ['reset'] },
                { required: ['fontSizePercent'] },
                { required: ['lineHeight'] },
                { required: ['measureCh'] },
                { required: ['paragraphSpacingEm'] },
                { required: ['pageLayout'] },
                { required: ['theme'] },
                { required: ['customCss'] },
              ],
            },
          },
          {
            properties: { reset: { const: true } },
            required: ['reset'],
            not: {
              anyOf: [
                { required: ['undo'] },
                { required: ['fontSizePercent'] },
                { required: ['lineHeight'] },
                { required: ['measureCh'] },
                { required: ['paragraphSpacingEm'] },
                { required: ['pageLayout'] },
                { required: ['theme'] },
                { required: ['customCss'] },
              ],
            },
          },
          {
            anyOf: [
              { required: ['fontSizePercent'] },
              { required: ['lineHeight'] },
              { required: ['measureCh'] },
              { required: ['paragraphSpacingEm'] },
              { required: ['pageLayout'] },
              { required: ['theme'] },
              { required: ['customCss'] },
            ],
            not: { anyOf: [{ required: ['undo'] }, { required: ['reset'] }] },
          },
        ],
        properties: {
          fontSizePercent: { type: 'number', minimum: 70, maximum: 200 },
          lineHeight: { type: 'number', minimum: 1.1, maximum: 2.2 },
          measureCh: { type: 'number', minimum: 40, maximum: 110 },
          paragraphSpacingEm: { type: 'number', minimum: 0, maximum: 2 },
          pageLayout: { type: 'string', enum: ['auto', 'single', 'spread'] },
          theme: { type: 'string', enum: ['publisher', 'light', 'sepia', 'dark'] },
          customCss: {
            type: 'string',
            maxLength: 20_000,
            description:
              'CSS applied inside the EPUB document only; it cannot style the library, reader chrome, panels, or Study. Requires designContextVersion.',
          },
          designContextVersion: {
            type: 'string',
            description:
              'The guidance version get_design_context returned. Required with customCss, ignored otherwise.',
          },
          reset: { type: 'boolean', description: 'Restore every presentation default.' },
          undo: {
            type: 'boolean',
            description: 'Put back the presentation as it was before the last change.',
          },
          actionGroupId: ACTION_GROUP_SCHEMA,
        },
        additionalProperties: false,
        dependentRequired: { customCss: ['designContextVersion'] },
      },
      execute: (input) =>
        run('set_reading_style', () => 'changed the presentation', async () => {
          const patchFields = [
            'fontSizePercent',
            'lineHeight',
            'measureCh',
            'paragraphSpacingEm',
            'pageLayout',
            'theme',
            'customCss',
          ]
          const hasPatch = patchFields.some((field) => input[field] !== undefined)
          const operationCount = Number(input.undo === true) + Number(input.reset === true) + Number(hasPatch)
          if (operationCount !== 1) {
            return errorResult(
              'Choose exactly one reading-style operation: undo, reset, or one or more presentation fields.',
            )
          }
          if (input.undo === true) {
            const undone = await commands.undoReadingStyle()
            if (!undone) {
              return textResult('There is no presentation change to undo.', { receipt: null })
            }
            return textResult(describeStyleReceipt(undone, 'Put the presentation back'), {
              receipt: undone,
            })
          }
          if (input.reset === true) {
            const receipt = await commands.resetReadingStyle(caller(input))
            return textResult(describeStyleReceipt(receipt, 'Restored the default presentation'), {
              receipt,
            })
          }
          // Only what was named. Merging over a style read a moment ago would
          // carry that snapshot back over anything changed in between.
          const patch: StylePatch = {
            ...(typeof input.fontSizePercent === 'number'
              ? { fontSizePercent: input.fontSizePercent }
              : {}),
            ...(typeof input.lineHeight === 'number' ? { lineHeight: input.lineHeight } : {}),
            ...(typeof input.measureCh === 'number' ? { measureCh: input.measureCh } : {}),
            ...(typeof input.paragraphSpacingEm === 'number'
              ? { paragraphSpacingEm: input.paragraphSpacingEm }
              : {}),
            ...(typeof input.pageLayout === 'string'
              ? { pageLayout: input.pageLayout as NonNullable<ReaderStyle['pageLayout']> }
              : {}),
            ...(typeof input.theme === 'string'
              ? { theme: input.theme as ReaderStyle['theme'] }
              : {}),
            ...(typeof input.customCss === 'string' ? { customCss: input.customCss } : {}),
          }
          if (Object.keys(patch).length === 0) {
            return errorResult('Nothing to change: name at least one presentation field.')
          }
          const receipt = await commands.setReadingStyle({
            patch,
            ...caller(input),
            ...(typeof input.designContextVersion === 'string'
              ? { designContextVersion: input.designContextVersion }
              : {}),
          })
          return textResult(describeStyleReceipt(receipt, 'Updated the presentation'), { receipt })
        }),
    },
    {
      name: 'create_study_lesson',
      description:
        'Create one durable, titled lesson as an ordered composition of prose, quotation, equation, steps, and question blocks. The whole lesson lands atomically or not at all, so a teaching sequence never appears as unrelated partial records. Call get_design_context first and follow its hierarchy guidance. Stable lesson and block ids let later tools reveal or address the exact teaching artifact.' +
        " Each block needs a unique id and exactly one kind with its own fields: prose requires text; quotation requires text, optionally attribution; equation requires expression, optionally caption; steps requires steps, optionally title; question requires prompt, optionally answer. Omit fields of other kinds entirely, even empty strings. Minimal prose block: {\"id\":\"explanation\",\"kind\":\"prose\",\"text\":\"Your explanation.\"}. For a source-linked lesson, send bookId, sourceRange and sourceQuote together, copied from Bookhand; otherwise omit that source triple. The top-level title, blocks, actionToken and current designContextVersion are required.",
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 500 },
          blocks: {
            type: 'array',
            minItems: 1,
            maxItems: 12,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 200, pattern: STABLE_ID_PATTERN },
                kind: { type: 'string', enum: [...STUDY_ITEM_KINDS] },
                text: { type: 'string', maxLength: 32_000 },
                attribution: { type: 'string', maxLength: 500 },
                expression: { type: 'string', maxLength: 5_000 },
                caption: { type: 'string', maxLength: 500 },
                title: { type: 'string', maxLength: 500 },
                steps: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 100,
                  items: { type: 'string', minLength: 1, maxLength: 5_000 },
                },
                prompt: { type: 'string', maxLength: 20_000 },
                answer: { type: 'string', maxLength: 20_000 },
              },
              required: ['id', 'kind'],
              additionalProperties: false,
            },
          },
          actionToken: {
            type: 'string',
            pattern: STABLE_ID_PATTERN,
            description: 'Your stable name for this atomic action; identical retries do not duplicate it.',
          },
          actionGroupId: ACTION_GROUP_SCHEMA,
          designContextVersion: {
            type: 'string',
            description: 'The exact version returned by get_design_context.',
          },
          bookId: BOOK_ID_SCHEMA,
          sourceRange: RANGE_SCHEMA,
          sourceQuote: { type: 'string', maxLength: 32_000 },
          sourceLabel: { type: 'string', maxLength: 500 },
        },
        required: ['title', 'blocks', 'actionToken', 'designContextVersion'],
        dependentRequired: {
          sourceRange: ['bookId', 'sourceQuote'],
          sourceQuote: ['bookId', 'sourceRange'],
        },
        additionalProperties: false,
      },
      execute: (input) =>
        run('create_study_lesson', () => 'created a composed lesson', async () => {
          if (typeof input.title !== 'string' || input.title.trim().length === 0 || input.title.length > 500) {
            return errorResult('A lesson title must be a non-empty string of at most 500 characters.')
          }
          if (!Array.isArray(input.blocks) || input.blocks.length < 1 || input.blocks.length > 12) {
            return errorResult('A lesson needs between one and twelve blocks.')
          }
          const ids = input.blocks.map((block) =>
            typeof block === 'object' && block !== null ? String(block.id ?? '') : '',
          )
          const safeId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/
          if (ids.some((id) => !safeId.test(id)) || new Set(ids).size !== ids.length) {
            return errorResult('Every lesson block needs a unique id using only letters, numbers, hyphens, or underscores.')
          }
          if (typeof input.actionToken !== 'string' || !safeId.test(input.actionToken)) {
            return errorResult('actionToken must use only letters, numbers, hyphens, or underscores.')
          }
          const blocks: StudyExperienceBlock[] = input.blocks.map((block) => {
            const record = block as Record<string, unknown>
            return { id: String(record.id), payload: toPayload(record) }
          })
          const receipt = await commands.createStudyExperience({
            title: String(input.title ?? ''),
            blocks,
            origin: 'agent',
            actionToken: String(input.actionToken),
            ...(typeof input.actionGroupId === 'string'
              ? { actionGroupId: input.actionGroupId }
              : {}),
            designContextVersion: String(input.designContextVersion),
            ...(input.sourceRange
              ? {
                  bookId: String(input.bookId ?? ''),
                  sourceRange: asRange(input.sourceRange),
                  sourceQuote: String(input.sourceQuote ?? ''),
                }
              : {}),
            ...(typeof input.sourceLabel === 'string' ? { sourceLabel: input.sourceLabel } : {}),
          })
          return textResult(
            `Created lesson ${receipt.applied.id}, “${receipt.applied.title},” with ${receipt.applied.blocks.length} ordered blocks. It is stored locally and the person can remove it in one action.`,
            { receipt },
          )
        }),
    },
    {
      name: 'list_study_lessons',
      description:
        'List the durable composed lessons on this book’s Study surface, including each stable lesson id, title, ordered block ids and kinds, source label, provenance, and revision. Use it to find an existing teaching artifact without receiving its full learner-authored content.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () =>
        run('list_study_lessons', () => 'read the lesson index', async () => {
          const lessons = await commands.listStudyExperiences()
          const summaries = lessons.map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            blocks: lesson.blocks.map((block) => ({ id: block.id, kind: block.payload.kind })),
            sourceLabel: lesson.sourceLabel ?? null,
            origin: lesson.origin,
            revision: lesson.revision,
          }))
          return textResult(
            summaries.length === 0
              ? 'There are no composed lessons on this board.'
              : summaries
                  .map(
                    (lesson) =>
                      `${lesson.id} · ${lesson.title} · ${lesson.blocks.map((block) => `${block.id}:${block.kind}`).join(', ')}`,
                  )
                  .join('\n'),
            { lessons: summaries },
          )
        }),
    },
    {
      name: 'upsert_study_item',
      description:
        'Put a durable study block on this book’s board, or update one you created. Send only the fields for the chosen kind, never empty placeholders for another kind: prose uses text; quotation uses text and optional attribution; equation uses expression and optional caption; steps uses steps and optional title; question uses prompt and optional answer. Common fields allowed for any kind are actionToken, actionGroupId, sourceLabel, id with updateToken, and bookId with sourceRange and sourceQuote. Blocks are stored locally across reloads and each remains individually reversible or removable by the person. Attach the source range so the person can jump back to where it came from. One ordinary block needs nothing else; before composing several blocks into one piece of teaching, call get_design_context for the composition hierarchy this board expects.' +
        " Minimal JSON: {\"kind\":\"prose\",\"text\":\"Your explanation.\"}. To update, supply id and its returned updateToken together; omit both when creating. Supply bookId, sourceRange and sourceQuote together for a source link, or omit all three. Do not invent source text or ownership tokens.",
      inputSchema: {
        type: 'object',
        oneOf: [
          {
            type: 'object',
            properties: {
              ...STUDY_ITEM_COMMON_PROPERTIES,
              kind: { const: 'prose' },
              text: { type: 'string', maxLength: 32_000, description: 'Prose body.' },
            },
            required: ['kind', 'text'],
            dependentRequired: STUDY_ITEM_DEPENDENT_REQUIRED,
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              ...STUDY_ITEM_COMMON_PROPERTIES,
              kind: { const: 'quotation' },
              text: { type: 'string', maxLength: 32_000, description: 'Quotation body.' },
              attribution: { type: 'string', maxLength: 500 },
            },
            required: ['kind', 'text'],
            dependentRequired: STUDY_ITEM_DEPENDENT_REQUIRED,
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              ...STUDY_ITEM_COMMON_PROPERTIES,
              kind: { const: 'equation' },
              expression: { type: 'string', maxLength: 5_000, description: 'Equation body.' },
              caption: { type: 'string', maxLength: 500 },
            },
            required: ['kind', 'expression'],
            dependentRequired: STUDY_ITEM_DEPENDENT_REQUIRED,
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              ...STUDY_ITEM_COMMON_PROPERTIES,
              kind: { const: 'steps' },
              title: { type: 'string', maxLength: 500, description: 'Title for a steps block.' },
              steps: {
                type: 'array',
                minItems: 1,
                maxItems: 100,
                items: { type: 'string', minLength: 1, maxLength: 5_000 },
              },
            },
            required: ['kind', 'steps'],
            dependentRequired: STUDY_ITEM_DEPENDENT_REQUIRED,
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              ...STUDY_ITEM_COMMON_PROPERTIES,
              kind: { const: 'question' },
              prompt: { type: 'string', maxLength: 20_000, description: 'Question body.' },
              answer: { type: 'string', maxLength: 20_000 },
            },
            required: ['kind', 'prompt'],
            dependentRequired: STUDY_ITEM_DEPENDENT_REQUIRED,
            additionalProperties: false,
          },
        ],
      },
      execute: (input) =>
        run('upsert_study_item', () => 'added to the study board', async () => {
          const hasId = typeof input.id === 'string' && input.id.length > 0
          const hasUpdateToken =
            typeof input.updateToken === 'string' && input.updateToken.length > 0
          if (hasId !== hasUpdateToken) {
            return errorResult('id and updateToken must be supplied together when revising a block.')
          }
          const sourceFields = ['bookId', 'sourceRange', 'sourceQuote'].filter(
            (field) => input[field] !== undefined,
          )
          if (sourceFields.length !== 0 && sourceFields.length !== 3) {
            return errorResult('bookId, sourceRange, and sourceQuote must be supplied together.')
          }
          const payload = toPayload(input)
          const receipt = await commands.upsertStudyItem({
            payload,
            origin: 'agent',
            ...(typeof input.id === 'string' ? { id: input.id } : {}),
            ...(typeof input.updateToken === 'string' ? { updateToken: input.updateToken } : {}),
            ...(typeof input.actionToken === 'string' ? { actionToken: input.actionToken } : {}),
            ...(typeof input.actionGroupId === 'string'
              ? { actionGroupId: input.actionGroupId }
              : {}),
            ...(input.sourceRange
              ? {
                  bookId: String(input.bookId ?? ''),
                  sourceRange: asRange(input.sourceRange),
                  sourceQuote: String(input.sourceQuote ?? ''),
                }
              : {}),
            ...(typeof input.sourceLabel === 'string' ? { sourceLabel: input.sourceLabel } : {}),
          })
          return textResult(describeReceipt(receipt), { receipt })
        }),
    },
    {
      name: 'list_study_items',
      description: 'Read what is already on this book’s study board, so you can build on it rather than repeat it.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () =>
        run('list_study_items', () => 'read the study board', async () => {
          const items = await commands.listStudyItems()
          if (items.length === 0) return textResult('The study board is empty.', { items })
          return textResult(
            items
              .map((item) => `${item.id} · ${item.payload.kind} · ${JSON.stringify(item.payload)}`)
              .join('\n'),
            { items },
          )
        }),
    },
    {
      name: 'get_section_source',
      description:
        "Read the current editable source for one section: the publisher's packaged XHTML on first read, or your latest rewrite on later reads, plus its stylesheets, revision, and sourceFingerprint. This is a source file, not a summary — treat it the way you would treat a file you are about to edit. Paths in it (src, href, url()) are package-relative; keep them relative when you write it back and Bookhand resolves them the same way the book does. Use diagnose_section when you want counts first, edit_section for small exact changes without returning the chapter, and rewrite_section for a complete transformation.",
      inputSchema: {
        type: 'object',
        properties: {
          sectionIndex: SECTION_INDEX_SCHEMA,
        },
        additionalProperties: false,
      },
      execute: (input) =>
        run('get_section_source', () => 'read this chapter’s markup', async () => {
          const source = await commands.getSectionSource(
            typeof input.sectionIndex === 'number' ? input.sectionIndex : undefined,
          )
          return textResult(
            `Section ${source.sectionIndex}${source.label ? ` (${source.label})` : ''}: ${source.revision} saved revision${source.revision === 1 ? '' : 's'}, fingerprint ${source.sourceFingerprint}; ${source.bytes} bytes of packaged XHTML and ${source.stylesheets.length} stylesheet${source.stylesheets.length === 1 ? '' : 's'}${source.rewritten ? ', currently showing your rewrite' : ''}.`,
            { ...source },
          )
        }),
    },
    {
      name: 'diagnose_section',
      description:
        "Facts about a section's markup: how many blocks, headings and images it has, what each image carries (its data-tex, alt text and source), and the block structure under its class names. Bookhand classifies none of it — deciding that an image is an equation rather than an illustration, or that a bold paragraph is really a heading, is your call.",
      inputSchema: {
        type: 'object',
        properties: {
          sectionIndex: SECTION_INDEX_SCHEMA,
        },
        additionalProperties: false,
      },
      execute: (input) =>
        run('diagnose_section', () => 'examined this chapter', async () => {
          const diagnosis = await commands.diagnoseSection(
            typeof input.sectionIndex === 'number' ? input.sectionIndex : undefined,
          )
          const { counts } = diagnosis
          return textResult(
            `Section ${diagnosis.sectionIndex}: ${counts.blocks} blocks, ${counts.headings} headings, ${counts.images} images (${counts.imagesWithTex} carrying LaTeX).`,
            { ...diagnosis },
          )
        }),
    },
    {
      name: 'rewrite_section',
      description:
        "Replace one EPUB spine section's complete body markup, and optionally its stylesheet, with what you wrote. A spine section can contain one chapter or many logical chapters: preserve every unrelated subsection plus existing IDs and link targets. If the person asked to change only one part of a larger section, use edit_section instead of returning a partial body that would erase the rest. For a genuinely complete transformation, rewrite the structure, headings, equations, figures, captions, accessibility, and CSS together. Design for an EPUB paginator, not a normal webpage: desktop pages are narrow reading columns (often only 30–35 characters each), viewport units describe the whole spread rather than one page, and fixed width/height, overflow:hidden, CSS columns, sticky/fixed positioning, or oversized display type can strand prose or split a title across pages. Keep the document in ordinary flow, keep headings intact at book-column scale, and let Bookhand own pagination and reader sizing. Nothing else is off limits except what could run code or reach the network — Bookhand strips scripts, event handlers, and off-origin URLs, and tells you exactly what it removed. Every edit is a new version: the person can Undo one step, Reset to the publisher's original, or flip between the two at any time.",
      inputSchema: {
        type: 'object',
        properties: {
          html: {
            type: 'string',
            description:
              "The section body's complete new markup. Semantic HTML5 and MathML both render natively.",
          },
          css: {
            type: 'string',
            description:
              "A stylesheet for this section, applied inside the book's own frame alongside the publisher's own. Typography is part of repairing a document, so write it together with the markup. Package-relative url() works; @import and off-origin url() are removed.",
          },
          summary: {
            type: 'string',
            maxLength: 240,
            description:
              'What you changed, in a sentence the person will see beside the Undo control.',
          },
          sectionIndex: SECTION_INDEX_SCHEMA,
        },
        required: ['html'],
        additionalProperties: false,
      },
      execute: (input) =>
        run('rewrite_section', () => 'rewrote this chapter', async () => {
          if (typeof input.html !== 'string' || input.html.trim().length === 0) {
            return errorResult('Send the section markup you want to apply as `html`.')
          }
          const result = await commands.rewriteSection(input.html, {
            ...(typeof input.css === 'string' ? { css: input.css } : {}),
            ...(typeof input.summary === 'string' ? { summary: input.summary } : {}),
            ...(typeof input.sectionIndex === 'number' ? { sectionIndex: input.sectionIndex } : {}),
          })
          const refusalSummary = describeRefusals(result.sanitized)
          const refused = refusalSummary ? ` Removed: ${refusalSummary}.` : ''
          const styleRefused = result.cssModified
            ? ' Some stylesheet rules were removed for reaching off-origin.'
            : ''
          return textResult(
            `Saved rewrite for section ${result.sectionIndex}: ${result.before.elements} elements became ${result.after.elements}. The readable book stayed mounted; the person can select Rewritten to reveal it.${refused}${styleRefused}`,
            { ...result },
          )
        }),
    },
    {
      name: 'edit_section',
      description:
        "Make a targeted coding-agent style edit to the section source you just read, without returning the whole spine section. Prefer this when the person's requested chapter or part is only one fragment inside a larger XHTML file. Every oldText must occur exactly once in the evolving source and the entire ordered batch is rejected if any edit is stale, missing, or ambiguous. Preserve IDs and link targets around the edited fragment. sourceFingerprint and sectionIndex must both be copied from the same latest get_section_source result. The accepted result uses the same sanitizer, saved revision, stable-frame refresh, Undo, and Reset path as rewrite_section. Omit css to preserve the current remaster stylesheet; send css only when replacing that agent-owned stylesheet.",
      inputSchema: {
        type: 'object',
        properties: {
          sourceFingerprint: {
            type: 'string',
            minLength: 1,
            description: 'Copy unchanged from the same latest get_section_source result as sectionIndex.',
          },
          edits: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            description: 'Ordered exact replacements. Include surrounding markup when oldText is not unique.',
            items: {
              type: 'object',
              properties: {
                oldText: { type: 'string', minLength: 1 },
                newText: { type: 'string' },
              },
              required: ['oldText', 'newText'],
              additionalProperties: false,
            },
          },
          css: {
            type: 'string',
            description: 'Optional complete replacement for the agent-owned remaster stylesheet.',
          },
          summary: {
            type: 'string',
            maxLength: 240,
            description: 'What you changed, in a sentence shown beside Undo.',
          },
          sectionIndex: SECTION_INDEX_SCHEMA,
        },
        required: ['sourceFingerprint', 'edits', 'sectionIndex'],
        additionalProperties: false,
      },
      execute: (input) =>
        run('edit_section', () => 'edited this chapter’s markup', async () => {
          if (typeof input.sourceFingerprint !== 'string' || !input.sourceFingerprint) {
            return errorResult('sourceFingerprint must come from get_section_source.')
          }
          if (!Number.isInteger(input.sectionIndex) || (input.sectionIndex as number) < 0) {
            return errorResult('sectionIndex must be copied from get_section_source.')
          }
          if (!Array.isArray(input.edits) || input.edits.length < 1 || input.edits.length > 50) {
            return errorResult('Send between 1 and 50 exact edits.')
          }
          const edits = input.edits.map((value, index) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
              throw new Error(`Edit ${index + 1} must contain oldText and newText.`)
            }
            const record = value as Record<string, unknown>
            if (
              typeof record.oldText !== 'string' || !record.oldText ||
              typeof record.newText !== 'string' ||
              Object.keys(record).some((key) => key !== 'oldText' && key !== 'newText')
            ) throw new Error(`Edit ${index + 1} must contain exactly non-empty oldText and string newText.`)
            return { oldText: record.oldText, newText: record.newText }
          })
          const result = await commands.editSection(input.sectionIndex as number, input.sourceFingerprint, edits, {
            ...(typeof input.css === 'string' ? { css: input.css } : {}),
            ...(typeof input.summary === 'string' ? { summary: input.summary } : {}),
          })
          const refusalSummary = describeRefusals(result.sanitized)
          const refused = refusalSummary ? ` Removed: ${refusalSummary}.` : ''
          const styleRefused = result.cssModified
            ? ' Some stylesheet rules were removed for reaching off-origin.'
            : ''
          return textResult(
            `Applied ${result.editsApplied} exact edit${result.editsApplied === 1 ? '' : 's'} to section ${result.sectionIndex}.${refused}${styleRefused}`,
            { ...result },
          )
        }),
    },
    {
      name: 'compile_section_math',
      description:
        "A shortcut, not the method. If a section's equations are images that still carry their original LaTeX in data-tex, this compiles all of them to MathML in one call, deterministically. Use it when the mathematics is the only thing wrong and you would otherwise be transcribing hundreds of identical images by hand; then edit the result with rewrite_section like any other markup. It reports what it could not compile so you can write those yourself.",
      inputSchema: {
        type: 'object',
        properties: {
          sectionIndex: SECTION_INDEX_SCHEMA,
        },
        additionalProperties: false,
      },
      execute: (input) =>
        run('compile_section_math', () => 'compiled this chapter’s equations', async () => {
          const report = await commands.compileSectionMath(
            typeof input.sectionIndex === 'number' ? input.sectionIndex : undefined,
          )
          return textResult(
            `Saved native MathML for ${report.restored} of ${report.found} equation images${report.residues.length > 0 ? `; ${report.residues.length} need writing by hand` : ''}. The readable book stayed mounted; the person can select Rewritten to reveal it.`,
            { ...report },
          )
        }),
    },
    {
      name: 'set_section_view',
      description:
        "Show the person the publisher's original markup or your rewrite, or step your own work back. \"original\" and \"rewritten\" flip what is on screen without discarding anything; \"undo\" steps back one revision; \"reset\" throws away every revision for the section and returns to the book as published.",
      inputSchema: {
        type: 'object',
        properties: {
          view: {
            type: 'string',
            enum: ['original', 'rewritten', 'undo', 'reset'],
          },
          sectionIndex: SECTION_INDEX_SCHEMA,
        },
        required: ['view'],
        additionalProperties: false,
      },
      execute: (input) =>
        run('set_section_view', () => 'changed what the chapter shows', async () => {
          const sectionIndex =
            typeof input.sectionIndex === 'number' ? input.sectionIndex : undefined
          if (input.view === 'undo') {
            const undone = await commands.undoSectionRewrite(sectionIndex)
            if (!undone) {
              return textResult('There is no rewrite to undo in this section.', { undone: false })
            }
            return textResult(
              undone.versions === 0
                ? 'Stepped back to the publisher’s original.'
                : `Stepped back one revision; ${undone.versions} of yours remain.`,
              { ...undone },
            )
          }
          if (input.view === 'reset') {
            const reset = await commands.resetSection(sectionIndex)
            return textResult(
              reset
                ? 'Reset this section to the book as published.'
                : 'This section has no rewrite to reset.',
              { reset },
            )
          }
          if (input.view !== 'original' && input.view !== 'rewritten') {
            return errorResult('Choose one of: original, rewritten, undo, reset.')
          }
          const changed = await commands.showRewritten(input.view === 'rewritten')
          return textResult(
            `Now showing the ${input.view === 'rewritten' ? 'rewritten' : 'published'} text${changed > 0 ? ` in ${changed} section${changed === 1 ? '' : 's'}` : ''}.`,
            { view: input.view, changed },
          )
        }),
    },
    {
      name: 'set_study_board_view',
      description:
        'Change what the study board is doing. "docked" and "expanded" are layout preferences the person keeps; "focus" brings the board forward and moves focus to it without changing their preference; "close" returns to the book without deleting anything. Prefer focus when you only want the person to look at what you added.' +
        " Supply either view OR undo:true, never both; omit the unused field entirely, not false, null or an empty string. Minimal JSON examples: {\"view\":\"focus\"} or {\"undo\":true}.",
      inputSchema: {
        type: 'object',
        oneOf: [
          { required: ['view'], not: { required: ['undo'] } },
          {
            properties: { undo: { const: true } },
            required: ['undo'],
            not: { required: ['view'] },
          },
        ],
        properties: {
          view: {
            type: 'string',
            enum: ['docked', 'expanded', 'focus', 'close'],
            description:
              'docked | expanded change the stored layout. focus | close change only what is on screen now.',
          },
          undo: {
            type: 'boolean',
            description: 'Put the layout back the way it was before your last change to it.',
          },
          actionGroupId: ACTION_GROUP_SCHEMA,
        },
        additionalProperties: false,
      },
      execute: (input) =>
        run('set_study_board_view', () => 'changed the board layout', async () => {
          const operationCount = Number(input.undo === true) + Number(input.view !== undefined)
          if (operationCount !== 1) {
            return errorResult('Choose exactly one board operation: undo or a view.')
          }
          if (input.undo === true) {
            const undone = await commands.undoStudyBoardView()
            if (!undone) {
              return textResult('There is no board layout change to undo.', { receipt: null })
            }
            return textResult(describeBoardReceipt(undone), { receipt: undone })
          }
          const view = input.view
          if (view !== 'docked' && view !== 'expanded' && view !== 'focus' && view !== 'close') {
            return errorResult('Choose one of: docked, expanded, focus, close.')
          }
          const receipt = await commands.setStudyBoardView(view, caller(input))
          return textResult(describeBoardReceipt(receipt), { receipt })
        }),
    },
  ]
  return tools.map((tool) =>
    withOutputSchema(tool, (message) =>
      onCall({ name: tool.name, summary: message, failed: true }),
    ),
  )
}

function toPayload(input: Record<string, unknown>): StudyItemPayload {
  const common = new Set([
    'id',
    'updateToken',
    'actionToken',
    'actionGroupId',
    'kind',
    'bookId',
    'sourceRange',
    'sourceQuote',
    'sourceLabel',
  ])
  const kindFields: Record<string, readonly string[]> = {
    prose: ['text'],
    quotation: ['text', 'attribution'],
    equation: ['expression', 'caption'],
    steps: ['title', 'steps'],
    question: ['prompt', 'answer'],
  }
  const allowed = kindFields[String(input.kind)]
  if (allowed) {
    const foreign = Object.keys(input).filter(
      (field) => !common.has(field) && !allowed.includes(field),
    )
    if (foreign.length > 0) {
      throw new Error(`${input.kind} does not accept: ${foreign.join(', ')}`)
    }
  }
  const requiredText = (field: string, maximum: number): string => {
    const value = input[field]
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) {
      throw new Error(`${field} must be a non-empty string of at most ${maximum} characters`)
    }
    return value
  }
  switch (input.kind) {
    case 'prose':
      return { kind: 'prose', text: requiredText('text', 32_000) }
    case 'quotation':
      return {
        kind: 'quotation',
        text: requiredText('text', 32_000),
        ...(typeof input.attribution === 'string' ? { attribution: input.attribution } : {}),
      }
    case 'equation':
      return {
        kind: 'equation',
        expression: requiredText('expression', 5_000),
        ...(typeof input.caption === 'string' ? { caption: input.caption } : {}),
      }
    case 'steps':
      return {
        kind: 'steps',
        ...(typeof input.title === 'string' ? { title: input.title } : {}),
        steps:
          Array.isArray(input.steps) && input.steps.length > 0
            ? input.steps.map((step) => {
                if (typeof step !== 'string' || step.trim().length === 0 || step.length > 5_000) {
                  throw new Error(
                    'every step must be a non-empty string of at most 5000 characters',
                  )
                }
                return step
              })
            : (() => {
                throw new Error('steps must contain at least one step')
              })(),
      }
    case 'question':
      return {
        kind: 'question',
        prompt: requiredText('prompt', 20_000),
        ...(typeof input.answer === 'string' ? { answer: input.answer } : {}),
      }
    default:
      throw new Error(`kind must be one of ${STUDY_ITEM_KINDS.join(', ')}`)
  }
}
