import { memoize } from 'lodash'
import Parser, { Language, Point, Query, SyntaxNode } from 'web-tree-sitter'

import { getParseLanguage, SupportedLanguage } from './grammars'
import { getParser } from './parser'
import { languages, QueryName } from './queries/languages'

interface ParsedQuery {
    compiled: Query
    raw: string
}
type ResolvedQueries = Record<QueryName, ParsedQuery>

const QUERIES_LOCAL_CACHE: Partial<Record<SupportedLanguage, ResolvedQueries>> = {}

/**
 * Reads all language queries from disk and parses them.
 * Saves queries the local cache for further use.
 */
export function initQueries(language: Language, languageId: SupportedLanguage): void {
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
    QUERIES_LOCAL_CACHE[languageId] = queries
}

interface DocumentQuerySDK extends QueryWrappers {
    parser: Parser
    queries: ResolvedQueries
    language: SupportedLanguage
}

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
        ...getQueryWrappers(queries, parser),
    }
}

interface QueryWrappers {
    getFirstMultilineBlockForTruncation: (
        node: SyntaxNode,
        startPosition?: Point,
        endPosition?: Point
    ) => Parser.SyntaxNode | null
}

/**
 * Query wrappers with custom logic requred for specific goals.
 * Memoize this function for each query object because it will be called many times with
 * no functional changes.
 */
const getQueryWrappers = memoize((queries: ResolvedQueries, _parser: Parser): QueryWrappers => {
    return {
        getFirstMultilineBlockForTruncation(node, startPosition, endPosition) {
            const captures = queries.blocks.compiled.captures(node, startPosition, endPosition)

            if (!captures.length) {
                return null
            }

            // Taking the last result to get the most nested node.
            // See https://github.com/tree-sitter/tree-sitter/discussions/2067
            const initialNode = captures.at(-1)!.node

            // Check for special cases where we need match a parent node.
            const potentialParentNodes = captures.filter(capture => capture.name === 'parents')
            const potentialParent = potentialParentNodes.find(capture => initialNode.parent?.id === capture.node.id)
                ?.node

            return potentialParent || initialNode
        },
    }
})
