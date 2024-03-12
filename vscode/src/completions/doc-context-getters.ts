import * as vscode from 'vscode'

import { getLanguageConfig } from '../tree-sitter/language'
import { type CompletionIntent, execQueryWrapper, positionToQueryPoints } from '../tree-sitter/query-sdk'

import { asPoint } from '../tree-sitter/parse-tree-cache'
import { parseString } from '../tree-sitter/parser'
import type { DocumentContext } from './get-current-doc-context'
import { lines } from './text-processing'

export function getCurrentLinePrefixWithoutInjectedPrefix(docContext: DocumentContext): string {
    const { currentLinePrefix, injectedPrefix } = docContext

    return injectedPrefix ? currentLinePrefix.slice(0, -injectedPrefix.length) : currentLinePrefix
}

interface GetContextRangeParams {
    prefix: string
    suffix: string
    position: vscode.Position
}

/**
 * @returns the range that overlaps the included prefix and suffix.
 */
export function getContextRange(
    document: vscode.TextDocument,
    params: GetContextRangeParams
): vscode.Range {
    const { prefix, suffix, position } = params
    const offset = document.offsetAt(position)

    return new vscode.Range(
        document.positionAt(offset - prefix.length),
        document.positionAt(offset + suffix.length)
    )
}

interface GetCompletionIntentParams {
    document: vscode.TextDocument
    position: vscode.Position
    prefix: string
}

export function getCompletionIntent(params: GetCompletionIntentParams): CompletionIntent | undefined {
    const { document, position, prefix } = params

    const blockStart = getLanguageConfig(document.languageId)?.blockStart
    const isBlockStartActive = blockStart && prefix.trimEnd().endsWith(blockStart)
    // Use `blockStart` for the cursor position if it's active.
    const positionBeforeCursor = isBlockStartActive
        ? document.positionAt(prefix.lastIndexOf(blockStart))
        : {
              line: position.line,
              character: Math.max(0, position.character - 1),
          }

    const queryPoints = positionToQueryPoints(positionBeforeCursor)
    const [completionIntent] = execQueryWrapper({
        document,
        queryPoints,
        queryWrapper: 'getCompletionIntent',
    })

    return completionIntent?.name
}

interface GetLastNGraphContextFromDocumentParams {
    n: number
    document: vscode.TextDocument
    position: vscode.Position
    currentLinePrefix: string
    /**
     * Parse this source string to get the tree for the tree-sitter query
     * instead of using `document.getText`
     */
    source?: string
}

export function getLastNGraphContextFromDocument(
    params: GetLastNGraphContextFromDocumentParams
): string[] {
    const { document, currentLinePrefix, position, n } = params

    const queryPoints = {
        startPoint: asPoint({
            line: Math.max(position.line - 100, 0),
            character: 0,
        }),
        endPoint: asPoint({
            line: position.line,
            character: currentLinePrefix.length,
        }),
    }

    const identifiers = execQueryWrapper({
        document,
        queryPoints,
        queryWrapper: 'getGraphContextIdentifiers',
    })
        .map(identifier => identifier.node.text)
        .filter(identifier => identifier.length > 2)

    return Array.from(new Set(identifiers.reverse())).slice(0, n)
}

interface GetLastNGraphContextFromStringParams {
    n: number
    document: vscode.TextDocument
    position: vscode.Position
    currentLinePrefix: string
    /**
     * Parse this source string to get the tree for the tree-sitter query
     * instead of using `document.getText()`
     */
    source: string
}

export function getLastNGraphContextFromString(params: GetLastNGraphContextFromStringParams): string[] {
    const { document, source, n } = params

    const queryPoints = {
        startPoint: asPoint({
            line: 0,
            character: 0,
        }),
        endPoint: asPoint({
            line: lines(source).length,
            character: source.length,
        }),
    }

    const tree = parseString(document.languageId, source)

    if (!tree) {
        return []
    }

    const identifiers = execQueryWrapper({
        languageId: document.languageId,
        queryPoints,
        queryWrapper: 'getGraphContextIdentifiers',
        tree,
    })
        .map(identifier => identifier.node.text)
        .filter(identifier => identifier.length > 2)

    return Array.from(new Set(identifiers.reverse())).slice(0, n)
}
