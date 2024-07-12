import dedent from 'dedent'

import { SupportedLanguage } from '../grammars'
import type { QueryName } from '../queries'

const DOCUMENTABLE_NODES = dedent`
    ; Function definitions
    ;--------------------------------
    (function_definition
        name: (name) @symbol.function) @range.function
    (method_declaration
        name: (name) @symbol.function) @range.function
    (function_call_expression
        function: [(qualified_name (name)) (name)] @symbol.function) @range.function
    (function_call_expression
        (name) @symbol.function) @range.function
    (class_declaration
        name: (name) @symbol.function) @range.function


	; Variables
    ;--------------------------------
    ((variable_name) @symbol.identifier) @range.identifier
    ((class_interface_clause) @symbol.identifier) @range.identifier

    ; Types
    ;--------------------------------
    (primitive_type) @symbol.function
    (interface_declaration
        name: (name) @symbol.function) @range.function
`

const ENCLOSING_FUNCTION_QUERY = dedent`
    (function_definition name: (name) @symbol.function) @range.function
`

export const phpQueries = {
    [SupportedLanguage.php]: {
        singlelineTriggers: '',
        intents: '',
        documentableNodes: DOCUMENTABLE_NODES,
        identifiers: '',
        graphContextIdentifiers: '',
        enclosingFunction: ENCLOSING_FUNCTION_QUERY,
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
