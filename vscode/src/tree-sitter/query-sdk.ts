import { Position, TextDocument } from 'vscode'
import Parser, { Point, Query, SyntaxNode } from 'web-tree-sitter'

import { getParseLanguage, SupportedLanguage } from './grammars'
import { getCachedParseTreeForDocument } from './parse-tree-cache'
import { getParser } from './parser'

interface ParsedQuery {
    compiled: Query
    raw: string
}
interface ResolvedQueries {
    [name: string]: ParsedQuery
}
interface QueryWrapper {
    [name: string]: (
        node: SyntaxNode,
        start: Point,
        end?: Point
    ) => [] | readonly [{ readonly node: SyntaxNode; readonly name: string }]
}

const QUERIES_LOCAL_CACHE: Partial<Record<SupportedLanguage, ResolvedQueries & QueryWrapper>> = {}

export interface DocumentQuerySDK<T extends QueryWrapper> {
    parser: Parser
    queries: ResolvedQueries & T
    language: SupportedLanguage
}

/**
 * Returns the query SDK only if the language has queries defined and
 * the relevant laguage parser is initialized.
 */
export function getDocumentQuerySDK<T extends QueryWrapper>(language: string): DocumentQuerySDK<T> | null {
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

export function execQueryWrapper<T extends QueryWrapper>(
    document: TextDocument,
    position: Pick<Position, 'line' | 'character'>,
    queryWrapper: keyof T
): ReturnType<T[typeof queryWrapper]> | never[] {
    const parseTreeCache = getCachedParseTreeForDocument(document)
    const documentQuerySDK = getDocumentQuerySDK<T>(document.languageId)

    const { startPoint, endPoint } = positionToQueryPoints(position)

    if (documentQuerySDK?.queries[queryWrapper] && parseTreeCache) {
        return documentQuerySDK.queries[queryWrapper](parseTreeCache.tree.rootNode, startPoint, endPoint) as ReturnType<
            T[typeof queryWrapper]
        >
    }

    return []
}
