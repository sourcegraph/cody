import * as vscode from 'vscode'

import { execQueryWrapper } from '../../../../tree-sitter/query-sdk'

import { dedupeWith } from '@sourcegraph/cody-shared'
import { asPoint } from '../../../../tree-sitter/parse-tree-cache'
import { parseString } from '../../../../tree-sitter/parser'
import { lines } from '../../../text-processing'

interface GetLastNGraphContextIdentifiersFromDocumentParams {
    n: number
    document: vscode.TextDocument
    position: vscode.Position
}

interface SymbolRequest {
    symbolName: string
    position: vscode.Position
    uri: vscode.Uri
    nodeType: string
    languageId: string
}

export function getLastNGraphContextIdentifiersFromDocument(
    params: GetLastNGraphContextIdentifiersFromDocumentParams
): SymbolRequest[] {
    const { document, position, n } = params

    const queryPoints = {
        startPoint: asPoint({
            line: Math.max(position.line - 100, 0),
            character: 0,
        }),
        endPoint: asPoint({
            line: position.line,
            character: position.character + 1,
        }),
    }

    const symbolRequests = execQueryWrapper({
        document,
        queryPoints,
        queryWrapper: 'getGraphContextIdentifiers',
    })
        .map(identifier => {
            return {
                uri: document.uri,
                languageId: document.languageId,
                nodeType: identifier.node.type,
                symbolName: identifier.node.text,
                position: new vscode.Position(
                    identifier.node.startPosition.row,
                    identifier.node.startPosition.column
                ),
            }
        })
        .sort((a, b) => (a.position.isBefore(b.position) ? 1 : -1))

    return dedupeWith(symbolRequests, 'symbolName').slice(0, n)
}

interface GetLastNGraphContextIdentifiersFromStringParams {
    n: number
    uri: vscode.Uri
    languageId: string
    /**
     * Parse this source string to get the tree for the tree-sitter query
     * instead of using `document.getText()`
     */
    source: string
}

export function getLastNGraphContextIdentifiersFromString(
    params: GetLastNGraphContextIdentifiersFromStringParams
): SymbolRequest[] {
    const { uri, languageId, source, n } = params

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

    const symbolRequests = execQueryWrapper({
        languageId,
        queryPoints,
        tree,
        queryWrapper: 'getGraphContextIdentifiers',
    })
        .map(identifier => {
            return {
                uri,
                languageId,
                nodeType: identifier.node.type,
                symbolName: identifier.node.text,
                position: new vscode.Position(
                    identifier.node.startPosition.row,
                    identifier.node.startPosition.column
                ),
            }
        })
        .sort((a, b) => (a.position.isBefore(b.position) ? 1 : -1))

    return dedupeWith(symbolRequests, 'symbolName').slice(0, n)
}
