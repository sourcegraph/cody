import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'
import type { TextDocument } from 'vscode'
import type { default as Parser, Tree } from 'web-tree-sitter'

import { type SupportedLanguage, isSupportedLanguage } from './grammars'
import { type WrappedParser, createParser, getParser } from './parser'

const parseTreesPerFile = new LRUCache<string, Tree>({
    max: 10,
    // Important: we need to call `Tree.delete()` to free up memory. Without
    // this, we leak memory. See CODY-3616.
    disposeAfter: tree => tree.delete(),
})

interface ParseTreeCache {
    tree: Tree
    parser: WrappedParser
    cacheKey: string
}

export function getCachedParseTreeForDocument(document: TextDocument): ParseTreeCache | null {
    const parseLanguage = getLanguageIfTreeSitterEnabled(document)

    if (!parseLanguage) {
        return null
    }

    const parser = getParser(parseLanguage)
    const cacheKey = document.uri.toString()
    const tree = parseTreesPerFile.get(cacheKey)

    if (!tree || !parser) {
        return null
    }

    return { tree, parser, cacheKey }
}

export async function parseDocument(document: TextDocument): Promise<void> {
    const parseLanguage = getLanguageIfTreeSitterEnabled(document)

    if (!parseLanguage) {
        return
    }

    const parser = await createParser({ language: parseLanguage })
    if (!parser) {
        return
    }

    updateParseTreeCache(document, parser)
}

export function updateParseTreeCache(document: TextDocument, parser: WrappedParser): void {
    const tree = parser.safeParse(document.getText())
    parseTreesPerFile.set(document.uri.toString(), tree)
}

function getLanguageIfTreeSitterEnabled(document: TextDocument): SupportedLanguage | null {
    const { languageId } = document

    /**
     * 1. Do not use tree-sitter for unsupported languages.
     * 2. Do not use tree-sitter for files with more than N lines to avoid performance issues.
     *    - https://github.com/tree-sitter/tree-sitter/issues/2144
     *    - https://github.com/neovim/neovim/issues/22426
     *
     *    Needs more testing to figure out if we need it. Playing it safe for the initial integration.
     */
    if (document.lineCount <= 10_000 && isSupportedLanguage(languageId)) {
        return languageId
    }

    return null
}

export function updateParseTreeOnEdit(edit: vscode.TextDocumentChangeEvent): void {
    const { document, contentChanges } = edit
    if (contentChanges.length === 0) {
        return
    }

    const cache = getCachedParseTreeForDocument(document)
    if (!cache) {
        return
    }

    const { tree, parser, cacheKey } = cache

    for (const change of contentChanges) {
        const startIndex = change.rangeOffset
        const oldEndIndex = change.rangeOffset + change.rangeLength
        const newEndIndex = change.rangeOffset + change.text.length
        const startPosition = document.positionAt(startIndex)
        const oldEndPosition = document.positionAt(oldEndIndex)
        const newEndPosition = document.positionAt(newEndIndex)
        const startPoint = asPoint(startPosition)
        const oldEndPoint = asPoint(oldEndPosition)
        const newEndPoint = asPoint(newEndPosition)

        tree.edit({
            startIndex,
            oldEndIndex,
            newEndIndex,
            startPosition: startPoint,
            oldEndPosition: oldEndPoint,
            newEndPosition: newEndPoint,
        })
    }

    const updatedTree = parser.safeParse(document.getText(), tree)
    parseTreesPerFile.set(cacheKey, updatedTree)
}

export function asPoint(position: Pick<vscode.Position, 'line' | 'character'>): Parser.Point {
    return { row: position.line, column: position.character }
}

export function parseAllVisibleDocuments(): Promise<unknown> {
    const promises: Promise<void>[] = []
    for (const editor of vscode.window.visibleTextEditors) {
        promises.push(parseDocument(editor.document))
    }
    return Promise.all(promises)
}
