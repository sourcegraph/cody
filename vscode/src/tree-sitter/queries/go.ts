import dedent from 'dedent'

import { SupportedLanguage } from '../grammars'
import type { QueryName } from '../queries'

const SINGLE_LINE_TRIGGERS = dedent`
    (struct_type (field_declaration_list ("{") @block_start)) @trigger
    (interface_type ("{") @block_start) @trigger
`

const DOCUMENTABLE_NODES = dedent`
    ; Functions
    ;--------------------------------
    (function_declaration
        name: (identifier) @symbol.function) @range.function
    (method_declaration
        name: (field_identifier) @symbol.function) @range.function

    ; Variables
    ;--------------------------------
    (var_declaration
        (var_spec
            (identifier) @symbol.identifier)) @range.identifier
    (const_declaration
        (const_spec
            (identifier) @symbol.identifier)) @range.identifier
    (short_var_declaration
        left:
            (expression_list (identifier) @symbol.identifier)) @range.identifier

    ; Types
    ;--------------------------------
    (type_declaration
        (type_spec name: (type_identifier) @symbol.identifier)) @range.identifier
    (struct_type
        (_
            (field_declaration name: (field_identifier) @symbol.identifier) @range.identifier))
    (interface_type
        (_
            name: (field_identifier) @symbol.identifier)  @range.identifier)

    ; Comments
    ;--------------------------------
    (comment) @comment
`

const ENCLOSING_FUNCTION_QUERY = dedent`
    (function_declaration (identifier) @symbol.function) @range.function
    (method_declaration (field_identifier) @symbol.function) @range.function
    (func_literal) @range.function
`

export const goQueries = {
    [SupportedLanguage.go]: {
        singlelineTriggers: SINGLE_LINE_TRIGGERS,
        intents: '',
        documentableNodes: DOCUMENTABLE_NODES,
        identifiers: '',
        graphContextIdentifiers: dedent`
            (call_expression (identifier) @identifier)
            (qualified_type (type_identifier) @identifier)
            (type_spec (type_identifier) @identifier)
            (selector_expression (field_identifier)) @identifier
        `,
        enclosingFunction: ENCLOSING_FUNCTION_QUERY,
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
