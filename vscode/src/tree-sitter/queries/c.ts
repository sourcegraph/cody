import dedent from 'dedent'

import { SupportedLanguage } from '../grammars'
import type { QueryName } from '../queries'

const DOCUMENTABLE_NODES = dedent`
    ; Function definitions
    ;--------------------------------
    (function_definition
        type: (primitive_type)
        declarator: (function_declarator)
        body: (compound_statement) @symbol.function) @range.function

    ; Class definitions
    ;--------------------------------
    (struct_specifier
        name: (type_identifier)
        body: (_)) @range.function
    (declaration
        type: (union_specifier
            name: (type_identifier) @symbol.function)) @range.function

    ; Variables
    ;--------------------------------
    (declaration) @symbol.identifier @range.identifier

    ; Types
    ;--------------------------------
    (type_definition
        type: (type_identifier) @symbol.identifier) @range.identifier
    (enum_specifier
        name: (type_identifier) @symbol.identifier) @range.identifier
`

const ENCLOSING_FUNCTION_QUERY = dedent`
    (function_declarator declarator: (identifier) @symbol.function) @range.function
`

export const cQueries = {
    [SupportedLanguage.c]: {
        singlelineTriggers: '',
        intents: '',
        documentableNodes: DOCUMENTABLE_NODES,
        identifiers: '',
        graphContextIdentifiers: '',
        enclosingFunction: ENCLOSING_FUNCTION_QUERY,
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
