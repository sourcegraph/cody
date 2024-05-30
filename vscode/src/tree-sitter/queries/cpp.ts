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
    (class_specifier
        name: (type_identifier)
        body: (_)) @range.class
    (struct_specifier
        name: (type_identifier)
        body: (_)) @range.struct
    (declaration
        type: (union_specifier
            name: (type_identifier) @symbol.union)) @range.union

    ; Variables
    ;--------------------------------
    (declaration) @symbol.identifier @range.identifier

    ; Types
    ;--------------------------------
    (type_definition
        type: (struct_specifier) @symbol.identifier) @range.identifier
    (enum_specifier
        name: (type_identifier) @symbol.identifier) @range.identifier
`

const ENCLOSING_FUNCTION_QUERY = dedent`
    (function_definition declarator: (function_declarator) @symbol.function) @range.function
`

export const cppQueries = {
    [SupportedLanguage.cpp]: {
        singlelineTriggers: '',
        intents: '',
        documentableNodes: DOCUMENTABLE_NODES,
        identifiers: '',
        graphContextIdentifiers: '',
        enclosingFunction: ENCLOSING_FUNCTION_QUERY,
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
