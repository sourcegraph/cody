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
    JSX = 'javascriptreact',
    TypeScript = 'typescript',
    TSX = 'typescriptreact',
    Java = 'java',
    Go = 'go',
    Python = 'python',
    Dart = 'dart',
    C = 'c',
    Cpp = 'cpp',
    CSharp = 'csharp',
    Php = 'php',
}

/**
 * Different languages have different names for lexem we want to work
 * with in our parser logic, this enum is supposed to be an abstraction
 * layer to parser and query code snippets with generic language agnostic
 * lexems, see map function below to see how generic lexems relate to
 * specific language lexem tokens.
 */
export enum GenericLexem {
    IfStatement,
    ElseClause,
    StatementBlock,
    CallExpression,
    Comment,
    MethodCall,
}

export type LEXEME_DICTIONARY = Record<GenericLexem, string | null>

export function getLanguageLexems(language: SupportedLanguage): LEXEME_DICTIONARY | null {
    switch (language) {
        case SupportedLanguage.JSX:
        case SupportedLanguage.JavaScript:
        case SupportedLanguage.TSX:
        case SupportedLanguage.TypeScript:
            return {
                [GenericLexem.IfStatement]: 'if_statement',
                [GenericLexem.ElseClause]: 'else_clause',
                [GenericLexem.StatementBlock]: 'statement_block',
                [GenericLexem.CallExpression]: 'call_expression',
                [GenericLexem.MethodCall]: 'call_expression',
                [GenericLexem.Comment]: 'comment',
            }

        case SupportedLanguage.Java:
            return {
                [GenericLexem.IfStatement]: 'if_statement',
                [GenericLexem.ElseClause]: 'else',
                [GenericLexem.StatementBlock]: 'block',
                [GenericLexem.CallExpression]: 'method_invocation',
                [GenericLexem.Comment]: 'comment',
                [GenericLexem.MethodCall]: 'method_invocation',
            }

        case SupportedLanguage.Go:
            return {
                [GenericLexem.IfStatement]: 'if_statement',
                [GenericLexem.ElseClause]: 'else',
                [GenericLexem.StatementBlock]: 'block',
                [GenericLexem.CallExpression]: 'call_expression',
                [GenericLexem.Comment]: 'comment',
                [GenericLexem.MethodCall]: 'call_expression',
            }

        case SupportedLanguage.Python:
            return {
                [GenericLexem.IfStatement]: 'if_statement',
                [GenericLexem.ElseClause]: 'else',
                [GenericLexem.StatementBlock]: 'block',
                [GenericLexem.CallExpression]: 'call',
                [GenericLexem.Comment]: 'comment',
                [GenericLexem.MethodCall]: 'call',
            }

        case SupportedLanguage.Dart:
            return {
                [GenericLexem.IfStatement]: 'if_statement',
                [GenericLexem.ElseClause]: 'else',
                [GenericLexem.StatementBlock]: 'block',
                [GenericLexem.CallExpression]: 'expression_statement',
                [GenericLexem.Comment]: 'comment',
                [GenericLexem.MethodCall]: 'call_expression',
            }

        case SupportedLanguage.C:
            return {
                [GenericLexem.IfStatement]: 'if_statement',
                [GenericLexem.ElseClause]: 'else_clause',
                [GenericLexem.StatementBlock]: 'compound_statement',
                [GenericLexem.CallExpression]: 'call_expression',
                [GenericLexem.Comment]: 'comment',
                // C doesn't support class or methods
                [GenericLexem.MethodCall]: null,
            }

        case SupportedLanguage.Cpp:
            return {
                [GenericLexem.IfStatement]: 'if_statement',
                [GenericLexem.ElseClause]: 'else_clause',
                [GenericLexem.StatementBlock]: 'compound_statement',
                [GenericLexem.CallExpression]: 'call_expression',
                [GenericLexem.Comment]: 'comment',
                [GenericLexem.MethodCall]: 'call_expression',
            }

        case SupportedLanguage.CSharp:
            return {
                [GenericLexem.IfStatement]: 'if_statement',
                [GenericLexem.ElseClause]: 'else',
                [GenericLexem.StatementBlock]: 'block',
                [GenericLexem.CallExpression]: 'invocation_expression',
                [GenericLexem.Comment]: 'comment',
                [GenericLexem.MethodCall]: 'invocation_expression',
            }

        case SupportedLanguage.Php:
            return {
                [GenericLexem.IfStatement]: 'if_statement',
                [GenericLexem.ElseClause]: 'else_clause',
                [GenericLexem.StatementBlock]: 'compound_statement',
                [GenericLexem.CallExpression]: 'function_call_expression',
                [GenericLexem.Comment]: 'comment',
                [GenericLexem.MethodCall]: 'member_call_expression',
            }

        default:
            return {
                [GenericLexem.IfStatement]: 'if_statement',
                [GenericLexem.ElseClause]: 'else_clause',
                [GenericLexem.StatementBlock]: 'statement_block',
                [GenericLexem.CallExpression]: 'call_expression',
                [GenericLexem.Comment]: 'comment',
                [GenericLexem.MethodCall]: null,
            }
    }
}
