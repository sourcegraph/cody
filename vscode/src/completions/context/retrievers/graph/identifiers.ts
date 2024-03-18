import type * as vscode from 'vscode'

import { execQueryWrapper } from '../../../../tree-sitter/query-sdk'

import { asPoint } from '../../../../tree-sitter/parse-tree-cache'
import { parseString } from '../../../../tree-sitter/parser'
import { lines } from '../../../text-processing'

interface GetLastNGraphContextIdentifiersFromDocumentParams {
    n: number
    document: vscode.TextDocument
    position: vscode.Position
    currentLinePrefix: string
}

export function getLastNGraphContextIdentifiersFromDocument(
    params: GetLastNGraphContextIdentifiersFromDocumentParams
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

interface GetLastNGraphContextIdentifiersFromStringParams {
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

export function getLastNGraphContextIdentifiersFromString(
    params: GetLastNGraphContextIdentifiersFromStringParams
): string[] {
    const {
        document: { languageId },
        source,
        n,
    } = params

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

    const tree = parseString(languageId, source)

    if (!tree) {
        return []
    }

    const identifiers = execQueryWrapper({
        languageId,
        queryPoints,
        queryWrapper: 'getGraphContextIdentifiers',
        tree,
    })
        .map(identifier => identifier.node.text)
        .filter(identifier => identifier.length > 2)

    return Array.from(new Set(identifiers.reverse())).slice(0, n)
}
