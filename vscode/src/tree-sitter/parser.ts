import path from 'path'

import * as vscode from 'vscode'
import type Parser from 'web-tree-sitter'

import { Tree } from 'web-tree-sitter'
import { DOCUMENT_LANGUAGE_TO_GRAMMAR, type SupportedLanguage, isSupportedLanguage } from './grammars'
import { initQueries } from './query-sdk'
const ParserImpl = require('web-tree-sitter') as typeof Parser

/*
 * Loading wasm grammar and creation parser instance every time we trigger
 * pre- and post-process might be a performance problem, so we create instance
 * and load language grammar only once, first time we need parser for a specific
 * language, next time we read it from this cache.
 */
const PARSERS_LOCAL_CACHE: Partial<Record<SupportedLanguage, Parser>> = {}

interface ParserSettings {
    language: SupportedLanguage

    /*
     * A custom path to the directory where we store wasm grammar modules
     * primary reasons for this is to provide a custom path for testing
     */
    grammarDirectory?: string
}

export function getParser(language: SupportedLanguage): Parser | undefined {
    return PARSERS_LOCAL_CACHE[language]
}

export function resetParsersCache(): void {
    for (const key of Object.keys(PARSERS_LOCAL_CACHE)) {
        delete PARSERS_LOCAL_CACHE[key as SupportedLanguage]
    }
}

async function isRegularFile(uri: vscode.Uri): Promise<boolean> {
    try {
        const stat = await vscode.workspace.fs.stat(uri)
        return stat.type === vscode.FileType.File
    } catch {
        return false
    }
}

export async function createParser(settings: ParserSettings): Promise<Parser | undefined> {
    const { language, grammarDirectory = __dirname } = settings

    const cachedParser = PARSERS_LOCAL_CACHE[language]

    if (cachedParser) {
        return cachedParser
    }

    const wasmPath = path.resolve(grammarDirectory, DOCUMENT_LANGUAGE_TO_GRAMMAR[language])
    if (!(await isRegularFile(vscode.Uri.file(wasmPath)))) {
        return undefined
    }

    await ParserImpl.init({ grammarDirectory })
    const parser = new ParserImpl()

    const languageGrammar = await ParserImpl.Language.load(wasmPath)

    parser.setLanguage(languageGrammar)
    // stop parsing after 50ms to avoid infinite loops
    // if that happens, tree-sitter throws an error so we can catch and address it
    parser.setTimeoutMicros(50_000)
    PARSERS_LOCAL_CACHE[language] = parser

    initQueries(languageGrammar, language, parser)

    return parser
}

export function parseString(languageId: string, source: string): Tree | null {
    if (!isSupportedLanguage(languageId)) {
        return null
    }

    const parser = getParser(languageId)

    if (!parser) {
        return null
    }

    return parser.parse(source)
}
