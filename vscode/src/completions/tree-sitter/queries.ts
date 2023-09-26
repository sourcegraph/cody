import Parser, { Language, Point, Query, SyntaxNode } from 'web-tree-sitter'

import { getParseLanguage, SupportedLanguage } from './grammars'
import { getParser } from './parser'
import { Captures } from './queries/annotate-and-match-snapshot'
import { languages, QueryName } from './queries/languages'

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
            startPosition: Point,
            endPosition?: Point
        ) => never[] | readonly [{ readonly node: Parser.SyntaxNode; readonly name: 'blocks' }]
    }
}

/**
 * Query wrappers with custom post-processing logic.
 */
function getLanguageSpecificQueryWrappers(queries: ResolvedQueries, _parser: Parser): QueryWrappers {
    return {
        blocks: {
            getFirstMultilineBlockForTruncation: (node, startPosition, endPosition) => {
                const captures = queries.blocks.compiled.captures(node, startPosition, endPosition)

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
    } satisfies Record<QueryName, Record<string, Captures>>
}
