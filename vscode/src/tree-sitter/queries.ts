import type { SupportedLanguage } from './grammars'
import { cppQueries } from './queries/cpp'
import { goQueries } from './queries/go'
import { javaQueries } from './queries/java'
import { javascriptQueries } from './queries/javascript'
import { kotlinQueries } from './queries/kotlin'
import { phpQueries } from './queries/php'
import { pythonQueries } from './queries/python'
import { rustQueries } from './queries/rust'

export type QueryName =
    | 'singlelineTriggers'
    | 'intents'
    | 'documentableNodes'
    | 'graphContextIdentifiers'
    | 'identifiers'
    | 'enclosingFunction'

/**
 * Completion intents sorted by priority.
 * Top-most items are used if capture group ranges are identical.
 */
export const intentPriority = [
    'function.name',
    'function.parameters',
    'function.body',
    'type_declaration.name',
    'type_declaration.body',
    'arguments',
    'import.source',
    'comment',
    'pair.value',
    'argument',
    'parameter',
    'parameters',
    'jsx_attribute.value',
    'return_statement.value',
    'return_statement',
    'string',
] as const

/**
 * Completion intent label derived from the AST nodes before the cursor.
 */
export type CompletionIntent = (typeof intentPriority)[number]

export const languages: Partial<Record<SupportedLanguage, Record<QueryName, string>>> = {
    ...javascriptQueries,
    ...goQueries,
    ...pythonQueries,
    ...javaQueries,
    ...kotlinQueries,
    ...phpQueries,
    ...rustQueries,
    ...cppQueries,
} as const
