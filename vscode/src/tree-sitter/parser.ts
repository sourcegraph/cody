import path from 'node:path'

import * as vscode from 'vscode'

import { wrapInActiveSpan } from '@sourcegraph/cody-shared'
import Parser, { type Tree } from 'web-tree-sitter'
import { captureException } from '../services/sentry/sentry'
import { DOCUMENT_LANGUAGE_TO_GRAMMAR, type SupportedLanguage, isSupportedLanguage } from './grammars'
import { initQueries } from './query-sdk'

// HACK(sqs): Calling `await WebTreeSitter.init(...)` (as required) somehow reassigns the
// `WebTreeSitter` binding value when running in vitest, and the new value is not a class. As a
// workaround, use a const to be able to refer to the pre-init() value. The alternative is for us to
// return to using `const Parser = require('web-tree-sitter')`, which seems to be essentially the
// same behavior (keeping a reference to the pre-init() value).
const ParserConst = Parser

/*
 * Loading wasm grammar and creation parser instance every time we trigger
 * pre- and post-process might be a performance problem, so we create instance
 * and load language grammar only once, first time we need parser for a specific
 * language, next time we read it from this cache.
 */
const PARSERS_LOCAL_CACHE: Partial<Record<SupportedLanguage, WrappedParser>> = {}

interface ParserSettings {
    language: SupportedLanguage

    /*
     * A custom path to the directory where we store wasm grammar modules
     * primary reasons for this is to provide a custom path for testing
     */
    grammarDirectory?: string
}

export function getParser(language: SupportedLanguage): WrappedParser | undefined {
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

type SafeParse = (
    input: string | Parser.Input,
    previousTree?: Parser.Tree,
    options?: Parser.Options
) => Parser.Tree | undefined

export type WrappedParser = Pick<Parser, 'parse' | 'getLanguage'> & {
    /**
     * Wraps `parser.parse()` call into an OpenTelemetry span.
     */
    observableParse: SafeParse
    safeParse: SafeParse
}

export async function createParser(settings: ParserSettings): Promise<WrappedParser | undefined> {
    const { language, grammarDirectory = __dirname } = settings

    const cachedParser = PARSERS_LOCAL_CACHE[language]

    if (cachedParser) {
        return cachedParser
    }

    const wasmPath = path.resolve(grammarDirectory, DOCUMENT_LANGUAGE_TO_GRAMMAR[language])

    if (!(await isRegularFile(vscode.Uri.file(wasmPath)))) {
        return undefined
    }

    await ParserConst.init({ grammarDirectory })
    const parser = new ParserConst()

    const languageGrammar = await ParserConst.Language.load(wasmPath)

    parser.setLanguage(languageGrammar)

    // Disable the timeout in unit tests to avoid timeout errors.
    if (!process.env.VITEST) {
        // Stop parsing after 70ms to avoid infinite loops.
        // If that happens, tree-sitter throws an error so we can catch and address it.
        parser.setTimeoutMicros(70_000)
    }

    const safeParse: SafeParse = (...args) => {
        try {
            return parser.parse(...args)
        } catch (error) {
            captureException(error)

            if (process.env.NODE_ENV === 'development') {
                console.error('parser.parse() error:', error)
            }

            return undefined
        }
    }

    const wrappedParser: WrappedParser = {
        getLanguage: () => parser.getLanguage(),
        parse: (...args) => parser.parse(...args),
        observableParse: (...args) => wrapInActiveSpan('parser.parse', () => safeParse(...args)),
        safeParse,
    }

    PARSERS_LOCAL_CACHE[language] = wrappedParser
    initQueries(languageGrammar, language, parser)

    return wrappedParser
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
