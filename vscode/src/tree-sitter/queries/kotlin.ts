import dedent from 'dedent'

import { SupportedLanguage } from '../grammars'
import type { QueryName } from '../queries'

const SINGLE_LINE_TRIGGERS = dedent`
    (function_declaration (simple_identifier) @symbol.function) @trigger
`

const DOCUMENTABLE_NODES = dedent`
    ; Function definitions
    ;--------------------------------
    ((function_declaration (simple_identifier) @symbol.function)
       (parameter (simple_identifier) @symbol.function)
       (class_parameter (simple_identifier) @symbol.function)
       (variable_declaration (simple_identifier) @symbol.function)) @range.function

    ; Variables
    ;--------------------------------
    (property_declaration
        (simple_identifier) @symbol.identifier) @range.identifier
    (variable_declaration
        (simple_identifier) @symbol.identifier) @range.identifier

    ; Types
    ;--------------------------------
    (class_declaration
    	(type_identifier) @symbol.identifier) @range.identifier

    ; Comments
    ;--------------------------------
    (line_comment) @comment
    (block_comment) @comment
`

const ENCLOSING_FUNCTION_QUERY = dedent`
    (function_declaration (simple_identifier) @symbol.function) @range.function
`

export const kotlinQueries = {
    [SupportedLanguage.kotlin]: {
        singlelineTriggers: SINGLE_LINE_TRIGGERS,
        intents: '',
        documentableNodes: DOCUMENTABLE_NODES,
        identifiers: '',
        graphContextIdentifiers: dedent`
            (call_expression (simple_identifier) @identifier)
            (type_identifier (type_identifier) @identifier)
        `,
        enclosingFunction: ENCLOSING_FUNCTION_QUERY,
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
