import Parser, { Language, Point, Query, QueryCapture, SyntaxNode } from 'web-tree-sitter'

import { getParseLanguage, SupportedLanguage } from './grammars'
import { getParser } from './parser'
import { languages, QueryName } from './queries'
import { Captures } from './query-tests/annotate-and-match-snapshot'

interface ParsedQuery {
    compiled: Query
    raw: string
}
type ResolvedQueries = {
    [name in QueryName]: ParsedQuery & QueryWrappers[name]
}

const QUERIES_LOCAL_CACHE: Partial<Record<SupportedLanguage, ResolvedQueries>> = {}

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

    // Add query wrappers to respective queries.
    // The resulting object ensures that query wrappers are inaccessible for languages
    // where queries are not defined yet.
    const queryWrappers = getLanguageSpecificQueryWrappers(queries, parser)
    const queriesWithQueryWrappers = Object.fromEntries(
        Object.entries(queries).map(([name, query]) => {
            return [name, { ...query, ...queryWrappers[name as keyof QueryWrappers] }] as const
        })
    ) as ResolvedQueries

    QUERIES_LOCAL_CACHE[languageId] = queriesWithQueryWrappers
}

interface DocumentQuerySDK {
    parser: Parser
    queries: ResolvedQueries
    language: SupportedLanguage
}

/**
 * Returns the query SDK only if the language has queries defined and
 * the relevant laguage parser is initialized.
 */
export function getDocumentQuerySDK(language: string): DocumentQuerySDK | null {
    const supportedLanguage = getParseLanguage(language)
    if (!supportedLanguage) {
        return null
    }

    const parser = getParser(supportedLanguage)
    const queries = QUERIES_LOCAL_CACHE[supportedLanguage]

    if (!parser || !queries) {
        return null
    }

    return {
        parser,
        queries,
        language: supportedLanguage,
    }
}

interface QueryWrappers {
    blocks: {
        /**
         * Returns the first block-like node (block_statement).
         * Handles special cases where we want to use the parent block instead
         * if it has a specific node type (if_statement).
         */
        getFirstMultilineBlockForTruncation: (
            node: SyntaxNode,
            start: Point,
            end?: Point
        ) => never[] | readonly [{ readonly node: SyntaxNode; readonly name: 'blocks' }]
    }
    multilineTriggers: {
        getEnclosingTrigger: (
            node: SyntaxNode,
            start: Point,
            end?: Point
        ) => never[] | readonly [{ readonly node: SyntaxNode; readonly name: 'trigger' }]
    }
    singlelineTriggers: {
        getEnclosingTrigger: (
            node: SyntaxNode,
            start: Point,
            end?: Point
        ) => never[] | readonly [{ readonly node: SyntaxNode; readonly name: 'trigger' }]
    }
}

/**
 * Query wrappers with custom post-processing logic.
 */
function getLanguageSpecificQueryWrappers(queries: ResolvedQueries, _parser: Parser): QueryWrappers {
    return {
        blocks: {
            getFirstMultilineBlockForTruncation: (node, start, end) => {
                const captures = queries.blocks.compiled.captures(node, start, end)

                if (!captures.length) {
                    return []
                }

                // Taking the last result to get the most nested node.
                // See https://github.com/tree-sitter/tree-sitter/discussions/2067
                const initialNode = captures.at(-1)!.node

                // Check for special cases where we need match a parent node.
                const potentialParentNodes = captures.filter(capture => capture.name === 'parents')
                const potentialParent = potentialParentNodes.find(capture => initialNode.parent?.id === capture.node.id)
                    ?.node

                return [{ node: potentialParent || initialNode, name: 'blocks' }] as const
            },
        },
        multilineTriggers: {
            getEnclosingTrigger: (root, start, end) => {
                const captures = queries.multilineTriggers.compiled.captures(root, start, end)
                const node = getTriggerNodeWithBlockStaringAtPoint(captures, start)

                if (!node) {
                    return []
                }

                return [{ node, name: 'trigger' }] as const
            },
        },
        singlelineTriggers: {
            getEnclosingTrigger: (root, start, end) => {
                const captures = queries.singlelineTriggers.compiled.captures(root, start, end)
                const node = getTriggerNodeWithBlockStaringAtPoint(captures, start)

                if (!node) {
                    return []
                }

                return [{ node, name: 'trigger' }] as const
            },
        },
    } satisfies Partial<Record<QueryName, Record<string, Captures>>>
}

function getTriggerNodeWithBlockStaringAtPoint(captures: QueryCapture[], point: Point): SyntaxNode | null {
    if (!captures.length) {
        return null
    }

    const blockStartNode = getNodeIfMatchesPoint({
        captures,
        name: 'block_start',
        // Taking the last result to get the most nested node.
        // See https://github.com/tree-sitter/tree-sitter/discussions/2067
        index: -1,
        point,
    })

    const multilineTrigger = getCapturedNodeAt({
        captures,
        name: 'trigger',
        index: -1,
    })

    const blockNode = blockStartNode?.parent

    if (!blockStartNode || !blockNode || !multilineTrigger) {
        return null
    }

    // Verify that the block node is empty and ends at the same position as the trigger node.
    if (!isBlockNodeEmpty(blockNode) || multilineTrigger.endIndex !== blockNode?.endIndex) {
        return null
    }

    return multilineTrigger
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
