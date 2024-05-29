import dedent from 'dedent'
import { SupportedLanguage } from '../grammars'
import type { QueryName } from '../queries'

const DOCUMENTABLE_NODES = dedent`
    ; Functions
    ;--------------------------------
    (method_declaration
        name: (identifier) @symbol.function) @range.function
    (constructor_declaration
        name: (identifier) @symbol.function) @range.function
    (record_declaration
        name: (identifier) @symbol.function) @range.function

    ; Variables
    ;--------------------------------
    (class_declaration
        name: (_) @symbol.identifier) @range.identifier
    (variable_declarator
        name: (identifier) @symbol.identifier) @range.identifier

    ; Type Identifiers
    ;--------------------------------
    (interface_declaration
        name: (identifier) @symbol.identifier) @range.identifier
    (enum_declaration
        name: (identifier) @symbol.identifier) @range.identifier
`

export const javaQueries = {
    [SupportedLanguage.java]: {
        documentableNodes: DOCUMENTABLE_NODES,
        singlelineTriggers: '',
        intents: '',
        identifiers: '',
        graphContextIdentifiers: '',
        enclosingFunction: '',
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
