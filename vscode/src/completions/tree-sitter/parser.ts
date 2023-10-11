import path from 'path'

import Parser from 'web-tree-sitter'

import { SupportedLanguage } from './grammars'
import { initQueries } from './query-sdk'

// eslint-disable-next-line @typescript-eslint/no-require-imports,@typescript-eslint/no-var-requires
const ParserImpl = require('web-tree-sitter') as typeof Parser

/*
 * Loading wasm grammar and creation parser instance everytime we trigger
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

export async function createParser(settings: ParserSettings): Promise<Parser> {
    const { language, grammarDirectory = __dirname } = settings

    const cachedParser = PARSERS_LOCAL_CACHE[language]

    if (cachedParser) {
        return cachedParser
    }

    await ParserImpl.init()
    const parser = new ParserImpl()

    const wasmPath = path.resolve(grammarDirectory, SUPPORTED_LANGUAGES[language])
    const languageGrammar = await ParserImpl.Language.load(wasmPath)

    parser.setLanguage(languageGrammar)
    PARSERS_LOCAL_CACHE[language] = parser

    initQueries(languageGrammar, language, parser)

    return parser
}

// TODO: Add grammar type autogenerate script
// see https://github.com/asgerf/dts-tree-sitter
type GrammarPath = string

/**
 * Map language to wasm grammar path modules, usually we would have
 * used node bindings for grammar packages, but since VSCode editor
 * runtime doesn't support this we have to work with wasm modules.
 *
 * Note: make sure that dist folder contains these modules when you
 * run VSCode extension.
 */
const SUPPORTED_LANGUAGES: Record<SupportedLanguage, GrammarPath> = {
    [SupportedLanguage.JavaScript]: 'tree-sitter-javascript.wasm',
    [SupportedLanguage.JSX]: 'tree-sitter-javascript.wasm',
    [SupportedLanguage.TypeScript]: 'tree-sitter-typescript.wasm',
    [SupportedLanguage.TSX]: 'tree-sitter-tsx.wasm',
    [SupportedLanguage.Java]: 'tree-sitter-java.wasm',
    [SupportedLanguage.Go]: 'tree-sitter-go.wasm',
    [SupportedLanguage.Python]: 'tree-sitter-python.wasm',
    [SupportedLanguage.Dart]: 'tree-sitter-dart.wasm',
    [SupportedLanguage.Cpp]: 'tree-sitter-cpp.wasm',
    [SupportedLanguage.CSharp]: 'tree-sitter-c_sharp.wasm',
    [SupportedLanguage.Php]: 'tree-sitter-php.wasm',
}
