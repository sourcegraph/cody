import { LRUCache } from 'lru-cache'
import { TextDocument } from 'vscode'
import Parser, { Tree } from 'web-tree-sitter'

import { getParseLanguage, SupportedLanguage } from './grammars'
import { createParser, getParser } from './parser'

// TODO: update parse-tree cache in the `onDidChangeTextDocument` handler.
const parseTreesPerFile = new LRUCache<string, Tree>({
    max: 10,
})

interface ParseTreeCache {
    tree: Tree
    parser: Parser
}

export function getCachedParseTreeForDocument(document: TextDocument): ParseTreeCache | null {
    const parseLanguage = getLanguageIfTreeSitterEnabled(document)

    if (!parseLanguage) {
        return null
    }

    const parser = getParser(parseLanguage)
    const tree = parseTreesPerFile.get(document.uri.toString())

    if (!tree || !parser) {
        return null
    }

    return { tree, parser }
}

export async function initParser(document: TextDocument): Promise<void> {
    const parseLanguage = getLanguageIfTreeSitterEnabled(document)

    if (!parseLanguage) {
        return
    }

    const parser = await createParser({ language: parseLanguage })
    updateParseTreeCache(document, parser)
}

export function updateParseTreeCache(document: TextDocument, parser: Parser): void {
    const tree = parser.parse(document.getText())
    parseTreesPerFile.set(document.uri.toString(), tree)
}

function getLanguageIfTreeSitterEnabled(document: TextDocument): SupportedLanguage | null {
    const parseLanguage = getParseLanguage(document.languageId)

    /**
     * 1. Do not use tree-sitter for unsupported languages.
     * 2. Do not use tree-sitter for files with more than N lines to avoid performance issues.
     *    - https://github.com/tree-sitter/tree-sitter/issues/2144
     *    - https://github.com/neovim/neovim/issues/22426
     *
     *    Needs more testing to figure out if we need it. Playing it safe for the initial integration.
     */
    if (document.lineCount <= 10_000 && parseLanguage) {
        return parseLanguage
    }

    return null
}
