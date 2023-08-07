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

enum StandardLexem {
    IfStatement = 'if_statement',
    ElseClause = 'else_clause',
    StatementBlock = 'statement_block',
    CallExpression = 'call_expression',
    Comment = 'comment',
}

enum JavaLexemType {
    IfStatement = 'if_statement',
    ElseClause = 'else',
    StatementBlock = 'block',
    MethodInvocation = 'method_invocation',
    Comment = 'comment',
}

enum GoLexemType {
    IfStatement = 'if_statement',
    ElseClause = 'else',
    StatementBlock = 'block',
    CallExpression = 'call_expression',
    MethodCall = 'call_expression',
    Comment = 'comment',
}

enum PythonLexemType {
    IfStatement = 'if_statement',
    ElseClause = 'else',
    StatementBlock = 'block',
    CallExpression = 'call',
    MethodCall = 'call',
    Comment = 'comment',
}

enum DartLexemType {
    Comment = 'comment',
    IfStatement = 'if_statement',
    ElseClause = 'else',
    StatementBlock = 'block',
    CallExpression = 'expression_statement',
    MethodCall = 'call_expression',
}

enum CLexemType {
    IfStatement = 'if_statement',
    ElseClause = 'else_clause',
    StatementBlock = 'compound_statement',
    CallExpression = 'call_expression',
    Comment = 'comment',
}

enum CppLexemType {
    Comment = 'comment',
    IfStatement = 'if_statement',
    ElseClause = 'else_clause',
    StatementBlock = 'compound_statement',
    CallExpression = 'call_expression',
    MethodCall = 'call_expression',
}

enum CSharpLexemType {
    Comment = 'comment',
    IfStatement = 'if_statement',
    ElseClause = 'else',
    StatementBlock = 'block',
    CallExpression = 'invocation_expression',
    MethodCall = 'invocation_expression',
}

enum PhpLexemType {
    Comment = 'comment',
    IfStatement = 'if_statement',
    ElseClause = 'else_clause',
    StatementBlock = 'compound_statement',
    CallExpression = 'function_call_expression',
    MethodCall = 'member_call_expression',
}

export type LEXEME_DICTIONARY = Record<GenericLexem, string | null>

export function getLanguageLexems(language: SupportedLanguage): LEXEME_DICTIONARY | null {
    switch (language) {
        case SupportedLanguage.JSX:
        case SupportedLanguage.JavaScript:
        case SupportedLanguage.TSX:
        case SupportedLanguage.TypeScript:
            return {
                [GenericLexem.IfStatement]: StandardLexem.IfStatement,
                [GenericLexem.ElseClause]: StandardLexem.ElseClause,
                [GenericLexem.StatementBlock]: StandardLexem.StatementBlock,
                [GenericLexem.CallExpression]: StandardLexem.CallExpression,
                [GenericLexem.Comment]: StandardLexem.Comment,
                [GenericLexem.MethodCall]: StandardLexem.CallExpression,
            }

        case SupportedLanguage.Java:
            return {
                [GenericLexem.IfStatement]: JavaLexemType.IfStatement,
                [GenericLexem.ElseClause]: JavaLexemType.ElseClause,
                [GenericLexem.StatementBlock]: JavaLexemType.StatementBlock,
                [GenericLexem.CallExpression]: JavaLexemType.MethodInvocation,
                [GenericLexem.Comment]: StandardLexem.Comment,
                [GenericLexem.MethodCall]: JavaLexemType.MethodInvocation,
            }

        case SupportedLanguage.Go:
            return {
                [GenericLexem.IfStatement]: GoLexemType.IfStatement,
                [GenericLexem.ElseClause]: GoLexemType.ElseClause,
                [GenericLexem.StatementBlock]: GoLexemType.StatementBlock,
                [GenericLexem.CallExpression]: GoLexemType.CallExpression,
                [GenericLexem.Comment]: StandardLexem.Comment,
                [GenericLexem.MethodCall]: GoLexemType.MethodCall,
            }

        case SupportedLanguage.Python:
            return {
                [GenericLexem.IfStatement]: PythonLexemType.IfStatement,
                [GenericLexem.ElseClause]: PythonLexemType.ElseClause,
                [GenericLexem.StatementBlock]: PythonLexemType.StatementBlock,
                [GenericLexem.CallExpression]: PythonLexemType.CallExpression,
                [GenericLexem.Comment]: StandardLexem.Comment,
                [GenericLexem.MethodCall]: PythonLexemType.MethodCall,
            }

        case SupportedLanguage.Dart:
            return {
                [GenericLexem.IfStatement]: DartLexemType.IfStatement,
                [GenericLexem.ElseClause]: DartLexemType.ElseClause,
                [GenericLexem.StatementBlock]: DartLexemType.StatementBlock,
                [GenericLexem.CallExpression]: DartLexemType.CallExpression,
                [GenericLexem.Comment]: StandardLexem.Comment,
                [GenericLexem.MethodCall]: DartLexemType.MethodCall,
            }

        case SupportedLanguage.C:
            return {
                [GenericLexem.IfStatement]: CLexemType.IfStatement,
                [GenericLexem.ElseClause]: CLexemType.ElseClause,
                [GenericLexem.StatementBlock]: CLexemType.StatementBlock,
                [GenericLexem.CallExpression]: CLexemType.CallExpression,
                [GenericLexem.Comment]: StandardLexem.Comment,
                // C doesn't support class or methods
                [GenericLexem.MethodCall]: null,
            }

        case SupportedLanguage.Cpp:
            return {
                [GenericLexem.IfStatement]: CppLexemType.IfStatement,
                [GenericLexem.ElseClause]: CppLexemType.ElseClause,
                [GenericLexem.StatementBlock]: CppLexemType.StatementBlock,
                [GenericLexem.CallExpression]: CppLexemType.CallExpression,
                [GenericLexem.Comment]: StandardLexem.Comment,
                [GenericLexem.MethodCall]: CppLexemType.MethodCall,
            }

        case SupportedLanguage.CSharp:
            return {
                [GenericLexem.IfStatement]: CSharpLexemType.IfStatement,
                [GenericLexem.ElseClause]: CSharpLexemType.ElseClause,
                [GenericLexem.StatementBlock]: CSharpLexemType.StatementBlock,
                [GenericLexem.CallExpression]: CSharpLexemType.CallExpression,
                [GenericLexem.Comment]: StandardLexem.Comment,
                [GenericLexem.MethodCall]: CSharpLexemType.MethodCall,
            }

        case SupportedLanguage.Php:
            return {
                [GenericLexem.IfStatement]: PhpLexemType.IfStatement,
                [GenericLexem.ElseClause]: PhpLexemType.ElseClause,
                [GenericLexem.StatementBlock]: PhpLexemType.StatementBlock,
                [GenericLexem.CallExpression]: PhpLexemType.CallExpression,
                [GenericLexem.Comment]: StandardLexem.Comment,
                [GenericLexem.MethodCall]: PhpLexemType.MethodCall,
            }

        default:
            return {
                [GenericLexem.IfStatement]: StandardLexem.IfStatement,
                [GenericLexem.ElseClause]: StandardLexem.ElseClause,
                [GenericLexem.StatementBlock]: StandardLexem.StatementBlock,
                [GenericLexem.CallExpression]: StandardLexem.CallExpression,
                [GenericLexem.Comment]: StandardLexem.Comment,
                [GenericLexem.MethodCall]: null,
            }
    }
}
