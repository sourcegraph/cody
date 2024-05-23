import { findLast } from 'lodash'
import type { Position, TextDocument } from 'vscode'
import type {
    Language,
    default as Parser,
    Point,
    Query,
    QueryCapture,
    SyntaxNode,
    Tree,
} from 'web-tree-sitter'

import { type SupportedLanguage, isSupportedLanguage } from './grammars'
import { getCachedParseTreeForDocument } from './parse-tree-cache'
import { type WrappedParser, getParser } from './parser'
import { type CompletionIntent, type QueryName, intentPriority, languages } from './queries'

interface ParsedQuery {
    compiled: Query
    raw: string
}
type ResolvedQueries = {
    [name in QueryName]: ParsedQuery
}

const QUERIES_LOCAL_CACHE: Partial<Record<SupportedLanguage, ResolvedQueries & QueryWrappers>> = {}

/**
 * Reads all language queries from disk and parses them.
 * Saves queries the local cache for further use.
 */
export function initQueries(language: Language, languageId: SupportedLanguage, parser: Parser): void {
    const cachedQueries = QUERIES_LOCAL_CACHE[languageId]
    if (cachedQueries) {
        return
    }

    const languageQueries = languages[languageId]
    if (languageQueries === undefined) {
        return
    }

    const queryEntries = Object.entries(languageQueries).map(([name, raw]) => {
        return [
            name,
            {
                raw,
                compiled: language.query(raw),
            },
        ] as const
    })

    const queries = Object.fromEntries<ParsedQuery>(queryEntries) as ResolvedQueries

    QUERIES_LOCAL_CACHE[languageId] = {
        ...queries,
        ...getLanguageSpecificQueryWrappers(queries, parser, languageId),
    }
}

export interface DocumentQuerySDK {
    parser: WrappedParser
    queries: ResolvedQueries & QueryWrappers
    language: SupportedLanguage
}

/**
 * Returns the query SDK only if the language has queries defined and
 * the relevant language parser is initialized.
 */
export function getDocumentQuerySDK(language: string): DocumentQuerySDK | null {
    if (!isSupportedLanguage(language)) {
        return null
    }

    const parser = getParser(language)
    const queries = QUERIES_LOCAL_CACHE[language]

    if (!parser || !queries) {
        return null
    }

    return {
        parser,
        queries,
        language,
    }
}

export interface QueryWrappers {
    getSinglelineTrigger: (
        node: SyntaxNode,
        start: Point,
        end?: Point
    ) => [] | readonly [{ readonly node: SyntaxNode; readonly name: 'trigger' }]
    getCompletionIntent: (
        node: SyntaxNode,
        start: Point,
        end?: Point
    ) => [] | readonly [{ readonly node: SyntaxNode; readonly name: CompletionIntent }]
    getDocumentableNode: (
        node: SyntaxNode,
        start: Point,
        end?: Point
    ) =>
        | []
        | readonly [
              {
                  symbol?: QueryCapture
                  range?: QueryCapture
                  insertionPoint?: QueryCapture
                  meta: { showHint: boolean }
              },
          ]
    getIdentifiers: (node: SyntaxNode, start: Point, end?: Point) => QueryCapture[]
    getGraphContextIdentifiers: (node: SyntaxNode, start: Point, end?: Point) => QueryCapture[]
    getEnclosingFunction: (node: SyntaxNode, start: Point, end?: Point) => QueryCapture[]
    getTestableNode: (
        node: SyntaxNode,
        start: Point,
        end?: Point
    ) =>
        | []
        | readonly [
              {
                  symbol?: QueryCapture
                  range?: QueryCapture
                  meta: { showHint: boolean }
              },
          ]
}

/**
 * Query wrappers with custom post-processing logic.
 */
function getLanguageSpecificQueryWrappers(
    queries: ResolvedQueries,
    _parser: Parser,
    languageId: SupportedLanguage
): QueryWrappers {
    return {
        getSinglelineTrigger: (root, start, end) => {
            const captures = queries.singlelineTriggers.compiled.captures(root, start, end)
            const { trigger, block } = getTriggerNodeWithBlockStaringAtPoint(captures, start)

            if (!trigger || !block || !isBlockNodeEmpty(block)) {
                return []
            }

            return [{ node: trigger, name: 'trigger' }] as const
        },
        getCompletionIntent: (root, start, end) => {
            const captures = queries.intents.compiled.captures(root, start, end)

            const { intentCapture } = getIntentFromCaptures(captures, start)

            if (!intentCapture) {
                return []
            }

            return [{ node: intentCapture.node, name: intentCapture.name as CompletionIntent }] as const
        },
        getDocumentableNode: (root, start, end) => {
            const captures = queries.documentableNodes.compiled.captures(
                root,
                { ...start, column: 0 },
                end ? { ...end, column: Number.MAX_SAFE_INTEGER } : undefined
            )

            const symbolCaptures = []
            const rangeCaptures = []

            for (const capture of captures) {
                if (capture.name.startsWith('range')) {
                    rangeCaptures.push(capture)
                } else if (capture.name.startsWith('symbol')) {
                    symbolCaptures.push(capture)
                }
            }

            const symbol = findLast(symbolCaptures, ({ node }) => {
                return (
                    node.startPosition.row === start.row &&
                    (node.startPosition.column <= start.column || node.startPosition.row < start.row) &&
                    (start.column <= node.endPosition.column || start.row < node.endPosition.row)
                )
            })

            const documentableRanges = rangeCaptures.filter(({ node }) => {
                return (
                    node.startPosition.row <= start.row &&
                    (start.column <= node.endPosition.column || start.row < node.endPosition.row)
                )
            })
            const range = documentableRanges.at(-1)

            let insertionPoint: QueryCapture | undefined
            if (languageId === 'python' && range) {
                /**
                 * Python is a special case for generating documentation.
                 * The insertion point of the documentation should differ if the symbol is a function or class.
                 * We need to query again for an insertion point, this time using the correct determined range.
                 *
                 * See https://peps.python.org/pep-0257/ for the documentation conventions for Python.
                 */
                const insertionCaptures = queries.documentableNodes.compiled
                    .captures(root, range.node.startPosition, range.node.endPosition)
                    .filter(({ name }) => name.startsWith('insertion'))

                insertionPoint = insertionCaptures.find(
                    ({ node }) =>
                        node.startIndex >= range.node.startIndex && node.endIndex <= range.node.endIndex
                )
            }

            /**
             * Modify where we look for a docstring depending on the language and syntax.
             * For Python functions and classes, we will have a provided `insertionPoint`, use the line below this.
             * For all other cases, docstrings should be attached above the symbol range, use this.
             */
            const docStringLine =
                languageId === 'python' && insertionPoint
                    ? insertionPoint.node.startPosition.row + 1
                    : start.row - 1
            const docstringCaptures = queries.documentableNodes.compiled
                .captures(
                    root,
                    { row: docStringLine, column: 0 },
                    { row: docStringLine, column: Number.MAX_SAFE_INTEGER }
                )
                .filter(node => node.name.startsWith('comment'))

            /**
             * Heuristic to determine if we should show a prominent hint for the symbol.
             * 1. If there is only one documentable range for this position, we can be confident it makes sense to document. Show the hint.
             * 2. Otherwise, only show the hint if the symbol is a function
             * 3. Don't show hint if there is no docstring already present.
             */
            const showHint = Boolean(
                (documentableRanges.length === 1 || symbol?.name.includes('function')) &&
                    docstringCaptures.length === 0
            )

            return [
                {
                    symbol,
                    range,
                    insertionPoint,
                    meta: { showHint },
                },
            ]
        },
        getIdentifiers: (root, start, end) => {
            return queries.identifiers.compiled.captures(root, start, end)
        },
        getGraphContextIdentifiers: (root, start, end) => {
            return queries.graphContextIdentifiers.compiled.captures(root, start, end)
        },
        getEnclosingFunction: (root, start, end) => {
            const captures = queries.enclosingFunction.compiled
                .captures(root, start, end)
                .filter(capture => capture.name.startsWith('range'))

            const firstEnclosingFunction = findLast(captures, ({ node }) => {
                return (
                    node.startPosition.row <= start.row &&
                    (start.column <= node.endPosition.column || start.row < node.endPosition.row)
                )
            })

            if (!firstEnclosingFunction) {
                return []
            }

            return [firstEnclosingFunction]
        },
        getTestableNode: (root, start, end) => {
            const captures = queries.enclosingFunction.compiled.captures(
                root,
                { ...start, column: 0 },
                end ? { ...end, column: Number.MAX_SAFE_INTEGER } : undefined
            )
            const symbolCaptures = []
            const rangeCaptures = []

            for (const capture of captures) {
                if (capture.name.startsWith('range')) {
                    rangeCaptures.push(capture)
                } else if (capture.name.startsWith('symbol')) {
                    symbolCaptures.push(capture)
                }
            }

            const symbol = findLast(symbolCaptures, ({ node }) => {
                return (
                    node.startPosition.row === start.row &&
                    (node.startPosition.column <= start.column || node.startPosition.row < start.row) &&
                    (start.column <= node.endPosition.column || start.row < node.endPosition.row)
                )
            })

            const testableRanges = rangeCaptures.filter(({ node }) => {
                return (
                    node.startPosition.row <= start.row &&
                    (start.column <= node.endPosition.column || start.row < node.endPosition.row)
                )
            })
            const range = testableRanges.at(-1)

            /**
             * Heuristic to determine if we should show a prominent hint for the symbol.
             * 1. If there is only one testable range for this position, we can be confident it makes sense to test. Show the hint.
             * 2. TODO: Look for usages of this function in test files, if it's already used then don't show the hint.
             */
            const showHint = Boolean(testableRanges.length === 1)

            return [
                {
                    symbol,
                    range,
                    meta: { showHint },
                },
            ]
        },
    }
}

// TODO: check if the block parent is empty in the consumer.
// Tracking: https://github.com/sourcegraph/cody/issues/1452
function getIntentFromCaptures(
    captures: QueryCapture[],
    cursor: Point
): { cursorCapture?: Parser.QueryCapture; intentCapture?: Parser.QueryCapture } {
    const emptyResult = {
        cursorCapture: undefined,
        intentCapture: undefined,
    }

    if (!captures.length) {
        return emptyResult
    }

    // Find the cursor capture group if exists.
    const [cursorCapture] = sortByIntentPriority(
        captures.filter(capture => {
            const { name, node } = capture

            const matchesCursorPosition =
                node.startPosition.column === cursor.column && node.startPosition.row === cursor.row

            return name.endsWith('.cursor') && matchesCursorPosition
        })
    )

    // Find the corresponding preceding intent capture that matches the cursor capture name.
    const intentCapture = findLast(captures, capture => {
        return capture.name === withoutCursorSuffix(cursorCapture?.name)
    })

    if (cursorCapture && intentCapture) {
        return { cursorCapture, intentCapture }
    }

    // If we didn't find a multinode intent, use the most nested atomic capture group.
    // Atomic capture groups are matches with one node and `!` at the end the capture group name.
    const atomicCapture = findLast(captures, capture => {
        const enclosesCursor =
            (capture.node.startPosition.column <= cursor.column ||
                capture.node.startPosition.row < cursor.row) &&
            (cursor.column <= capture.node.endPosition.column ||
                cursor.row < capture.node.endPosition.row)

        return capture.name.endsWith('!') && enclosesCursor
    })

    if (atomicCapture) {
        return {
            intentCapture: {
                ...atomicCapture,
                // Remove `!` from the end of the capture name.
                name: atomicCapture.name.slice(0, -1),
            },
        }
    }

    return emptyResult
}

function sortByIntentPriority(captures: QueryCapture[]): QueryCapture[] {
    return captures.sort((a, b) => {
        return (
            intentPriority.indexOf(withoutCursorSuffix(a.name) as CompletionIntent) -
            intentPriority.indexOf(withoutCursorSuffix(b.name) as CompletionIntent)
        )
    })
}

function withoutCursorSuffix(name?: string): string | undefined {
    return name?.split('.').slice(0, -1).join('.')
}

function getTriggerNodeWithBlockStaringAtPoint(
    captures: QueryCapture[],
    point: Point
): { trigger?: SyntaxNode; block?: SyntaxNode } {
    const emptyResult = {
        trigger: undefined,
        block: undefined,
    }

    if (!captures.length) {
        return emptyResult
    }

    const blockStart = getNodeIfMatchesPoint({
        captures,
        name: 'block_start',
        // Taking the last result to get the most nested node.
        // See https://github.com/tree-sitter/tree-sitter/discussions/2067
        index: -1,
        point,
    })

    const trigger = getCapturedNodeAt({
        captures,
        name: 'trigger',
        index: -1,
    })

    const block = blockStart?.parent

    if (!blockStart || !block || !trigger) {
        return emptyResult
    }

    // Verify that the block node ends at the same position as the trigger node.
    if (trigger.endIndex !== block?.endIndex) {
        return emptyResult
    }

    return { trigger, block }
}

interface GetNodeIfMatchesPointParams {
    captures: QueryCapture[]
    name: string
    index: number
    point: Point
}

function getNodeIfMatchesPoint(params: GetNodeIfMatchesPointParams): SyntaxNode | null {
    const { captures, name, index, point } = params

    const node = getCapturedNodeAt({ captures, name, index })

    if (node && node.startPosition.column === point.column && node.startPosition.row === point.row) {
        return node
    }

    return null
}

interface GetCapturedNodeAtParams {
    captures: QueryCapture[]
    name: string
    index: number
}

function getCapturedNodeAt(params: GetCapturedNodeAtParams): SyntaxNode | null {
    const { captures, name, index } = params

    return captures.filter(capture => capture.name === name).at(index)?.node || null
}

/**
 * Consider a block empty if it does not have any named children or is missing its closing tag.
 */
function isBlockNodeEmpty(node: SyntaxNode | null): boolean {
    // Consider a node empty if it does not have any named children.
    const isBlockEmpty = node?.children.filter(c => c.isNamed()).length === 0
    const isMissingBlockEnd = Boolean(node?.lastChild?.isMissing())

    return isBlockEmpty || isMissingBlockEnd
}

interface QueryPoints {
    startPoint: Point
    endPoint: Point
}

export function positionToQueryPoints(position: Pick<Position, 'line' | 'character'>): QueryPoints {
    const startPoint = {
        row: position.line,
        column: position.character,
    }

    const endPoint = {
        row: position.line,
        // Querying around one character after trigger position.
        column: position.character + 1,
    }

    return { startPoint, endPoint }
}

type ExecQueryWrapperParams<T> = {
    queryWrapper: T
} & (
    | {
          document: TextDocument
          queryPoints: QueryPoints
      }
    | {
          document: TextDocument
          position: Pick<Position, 'line' | 'character'>
      }
    | {
          tree: Tree
          languageId: string
          queryPoints: QueryPoints
      }
    | {
          tree: Tree
          languageId: string
          position: Pick<Position, 'line' | 'character'>
      }
)

export function execQueryWrapper<T extends keyof QueryWrappers>(
    params: ExecQueryWrapperParams<T>
): ReturnType<QueryWrappers[T]> | never[] {
    const { queryWrapper } = params

    const treeToQuery =
        'document' in params ? getCachedParseTreeForDocument(params.document)?.tree : params.tree
    const languageId = 'document' in params ? params.document.languageId : params.languageId
    const documentQuerySDK = getDocumentQuerySDK(languageId as SupportedLanguage)

    const queryPoints =
        'position' in params ? positionToQueryPoints(params.position) : params.queryPoints
    const { startPoint, endPoint } = queryPoints

    if (documentQuerySDK && treeToQuery) {
        return documentQuerySDK.queries[queryWrapper](
            treeToQuery.rootNode,
            startPoint,
            endPoint
        ) as ReturnType<QueryWrappers[T]>
    }

    return []
}

export type { CompletionIntent }
