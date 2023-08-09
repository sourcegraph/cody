import path from 'path'

import Parser, { Point, SyntaxNode, Tree } from 'web-tree-sitter'

import { GenericLexem, getLanguageLexems, SupportedLanguage } from './grammars'

export { SupportedLanguage, GenericLexem, Tree, SyntaxNode, Point }

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
    [SupportedLanguage.C]: 'tree-sitter-c.wasm',
    [SupportedLanguage.Cpp]: 'tree-sitter-cpp.wasm',
    [SupportedLanguage.CSharp]: 'tree-sitter-c_sharp.wasm',
    [SupportedLanguage.Php]: 'tree-sitter-php.wasm',
}

/*
 * Loading wasm grammar and creation parser instance everytime we trigger
 * pre- and post-process might be a performance problem, so we create instance
 * and load language grammar only once, first time we need parser for a specific
 * language, next time we read it from this cache.
 * */
const PARSERS_LOCAL_CACHE: Partial<Record<SupportedLanguage, Parser>> = {}

interface ParserSettings {
    language: SupportedLanguage

    /*
     * A custom path to the directory where we store wasm grammar modules
     * primary reasons for this is to provide a custom path for testing
     */
    grammarDirectory?: string
}

export interface ParserApi {
    parse: (sourceCode: string) => Promise<Tree>
    findClosestLexem: (rootNode: SyntaxNode, cursor: Point, lexemType: GenericLexem) => SyntaxNode | null
    findParentLexem: (element: SyntaxNode, lexemType: GenericLexem) => SyntaxNode | null
}

export function createParser(settings: ParserSettings): ParserApi {
    const { language, grammarDirectory } = settings

    let parser = PARSERS_LOCAL_CACHE[language]
    const lexems = getLanguageLexems(language)

    return {
        parse: async (sourceCode: string): Promise<Tree> => {
            if (!parser) {
                await Parser.init()
                parser = new Parser()

                const rootDir = grammarDirectory ?? __dirname
                const wasmPath = path.resolve(rootDir, SUPPORTED_LANGUAGES[language])
                const languageGrammar = await Parser.Language.load(wasmPath)

                parser.setLanguage(languageGrammar)
                PARSERS_LOCAL_CACHE[language] = parser
            }

            return parser.parse(sourceCode)
        },

        findClosestLexem(rootNode: SyntaxNode, cursor: Point, lexemType: GenericLexem): SyntaxNode | null {
            const nodeAtCursor: SyntaxNode | null = rootNode.descendantForPosition(cursor)

            return this.findParentLexem(nodeAtCursor, lexemType)
        },
        findParentLexem: (element: SyntaxNode, lexemType: GenericLexem): SyntaxNode | null => {
            const currentLexem = lexems?.[lexemType]

            if (!currentLexem) {
                throw new Error(`Support current lexem ${lexemType} for ${language} language`)
            }

            let nodeAtCursor: SyntaxNode | null = element

            while (nodeAtCursor) {
                if (nodeAtCursor?.type === currentLexem) {
                    return nodeAtCursor
                }

                nodeAtCursor = nodeAtCursor.parent
            }

            return null
        },
    }
}

/*
 * Walk the whole syntax tree recursively and log each node text
 * and its lexem type. It's used mostly for debug purpose.
 */
export function logTree(node: SyntaxNode): void {
    console.group(node.type)
    console.log(node.text)

    for (const child of node.children) {
        logTree(child)
    }

    console.groupEnd()
}
