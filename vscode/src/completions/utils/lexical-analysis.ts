import path from 'path'

import Parser, { Point, SyntaxNode, Tree } from 'web-tree-sitter'

/**
 * List of all supported languages that we have grammars and
 * lexems for. Note that enum values are copied from VSCode API,
 * if we want to make it work with different editors we should
 * enhance language detection.
 *
 * TODO: Decouple language detect to make it editor agnostic
 */
export enum SupportedLanguage {
    JavaScript = 'javascript',
    TypeScript = 'typescript',
    Java = 'java',
    Go = 'go',
    // The problem with these two is that we have to use typescript
    // wasm module grammar, the problem that exports in wasm works differently
    // we probably have to compile custom wasm module for tsx grammar.
    // JSX = 'javascriptreact',
    // TSX = 'typescriptreact',
}

// TODO: Add grammar type autogenerate script
// see https://github.com/asgerf/dts-tree-sitter
type GrammarPath = string

const SUPPORTED_LANGUAGES: Record<SupportedLanguage, GrammarPath> = {
    [SupportedLanguage.JavaScript]: 'tree-sitter-javascript.wasm',
    [SupportedLanguage.Java]: 'tree-sitter-java.wasm',
    [SupportedLanguage.Go]: 'tree-sitter-go.wasm',
    [SupportedLanguage.TypeScript]: 'tree-sitter-typescript.wasm',
    // Since TypeScript is a subset over javascript grammar we
    // use typescript grammar here in order to support jsx parsing
    // [SupportedLanguage.JSX]: TypeScript.tsx,
    // [SupportedLanguage.TypeScript]: TypeScript.typescript,
    // [SupportedLanguage.TSX]: TypeScript.tsx,
}

export enum GenericLexem {
    IfStatement,
    ElseClause,
    StatementBlock,
    CallExpression,
}

enum JavaScriptLexemType {
    IfStatement = 'if_statement',
    ElseClause = 'else_clause',
    StatementBlock = 'statement_block',
    CallExpression = ' call_expression',
}

enum JavaLexemType {
    IfStatement = 'if_statement',
    ElseClause = 'else',
    StatementBlock = 'block',
    MethodInvocation = 'method_invocation',
}

enum GoLexemType {
    IfStatement = 'if_statement',
    ElseClause = 'else',
    StatementBlock = 'block',
    CallExpression = 'call_expression',
}

type LEXEME_DICTIONARY = Record<GenericLexem, string>

export const LANGUAGE_TO_LEXEM: Partial<Record<SupportedLanguage, LEXEME_DICTIONARY>> = {
    [SupportedLanguage.JavaScript]: {
        [GenericLexem.IfStatement]: JavaScriptLexemType.IfStatement,
        [GenericLexem.ElseClause]: JavaScriptLexemType.ElseClause,
        [GenericLexem.StatementBlock]: JavaScriptLexemType.StatementBlock,
        [GenericLexem.CallExpression]: JavaScriptLexemType.CallExpression,
    },
    // We reuse JavaScript lexemes for typescript since TS grammar extends
    // JavaScript grammar
    [SupportedLanguage.TypeScript]: {
        [GenericLexem.IfStatement]: JavaScriptLexemType.IfStatement,
        [GenericLexem.ElseClause]: JavaScriptLexemType.ElseClause,
        [GenericLexem.StatementBlock]: JavaScriptLexemType.StatementBlock,
        [GenericLexem.CallExpression]: JavaScriptLexemType.CallExpression,
    },
    [SupportedLanguage.Java]: {
        [GenericLexem.IfStatement]: JavaLexemType.IfStatement,
        [GenericLexem.ElseClause]: JavaLexemType.ElseClause,
        [GenericLexem.StatementBlock]: JavaLexemType.StatementBlock,
        [GenericLexem.CallExpression]: JavaLexemType.MethodInvocation,
    },
    [SupportedLanguage.Go]: {
        [GenericLexem.IfStatement]: GoLexemType.IfStatement,
        [GenericLexem.ElseClause]: GoLexemType.ElseClause,
        [GenericLexem.StatementBlock]: GoLexemType.StatementBlock,
        [GenericLexem.CallExpression]: GoLexemType.CallExpression,
    },
}

export function getLanguageLexems(language: SupportedLanguage): LEXEME_DICTIONARY | null {
    return LANGUAGE_TO_LEXEM[language] ?? null
}

interface ParserSettings {
    language: SupportedLanguage

    /*
     * A custom path to the directory where we store wasm grammar modules
     * primary reasons for this is to provide a custom path for testing
     */
    grammarDirectory?: string
}

interface ParserApi {
    parse: (sourceCode: string) => Promise<Tree>
    findClosestLexem: (rootNode: SyntaxNode, cursor: Point, lexemType: GenericLexem) => SyntaxNode | null
}

export function createParser(settings: ParserSettings): ParserApi {
    const { language, grammarDirectory } = settings

    let parser: Parser
    const lexems = getLanguageLexems(language)

    return {
        parse: async (sourceCode: string): Promise<Tree> => {
            if (!parser) {
                await Parser.init()
                parser = new Parser()
            }

            const rootDir = grammarDirectory ?? __dirname
            const wasmPath = path.resolve(rootDir, SUPPORTED_LANGUAGES[language])
            const languageGrammar = await Parser.Language.load(wasmPath)

            parser.setLanguage(languageGrammar)

            return parser.parse(sourceCode)
        },

        findClosestLexem: (rootNode: SyntaxNode, cursor: Point, lexemType: GenericLexem): SyntaxNode | null => {
            const currentLexem = lexems?.[lexemType]

            if (!currentLexem) {
                throw new Error(`Support current lexem ${lexemType} for ${language} language`)
            }

            let nodeAtCursor: SyntaxNode | null = rootNode.descendantForPosition(cursor)

            while (nodeAtCursor) {
                nodeAtCursor = nodeAtCursor.parent

                if (nodeAtCursor?.type === currentLexem) {
                    return nodeAtCursor
                }
            }

            return null
        },
    }
}
