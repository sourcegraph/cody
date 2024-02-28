import dedent from 'dedent'

import { SupportedLanguage } from '../grammars'
import type { QueryName } from '../queries'

const INTENTS_QUERY = dedent`
    ; Cursor dependent intents
    ;--------------------------------

    (function_definition
        name: (_) @function.name!
        parameters: (_ ("(") @function.parameters.cursor) @function.parameters (":") @function.body.cursor
        body: (block) @function.body)

    (lambda
        parameters: (_) @function.parameters (":") @function.body.cursor
        body: (_) @function.body)

    (class_definition
        name: (_) @class.name (":") @class.body.cursor
        body: (_) @class.body)

    (argument_list ("(") @arguments.cursor) @arguments


    ; Atomic intents
    ;--------------------------------

    (import_from_statement
        module_name: (_) @import.source!
        name: (_) @import.name!)

    (comment) @comment!
    (argument_list (_) @argument!)

    (parameters) @parameters!
    (lambda_parameters) @parameters!
    (parameters (_) @parameter!)
    (lambda_parameters (_)) @parameter!

    (return_statement) @return_statement!
    (return_statement (_) @return_statement.value!)
`

const DOCUMENTABLE_NODES_QUERY = dedent`
    ; Function definitions
    ;--------------------------------
    (function_definition
        name: (identifier) @function)

    ; Class definitions
    ;--------------------------------
    (class_definition
        name: (identifier) @class)

    ; Assignments
    ;--------------------------------
    (assignment
        left: (identifier) @variable)
`

export const pythonQueries = {
    [SupportedLanguage.python]: {
        singlelineTriggers: '',
        intents: INTENTS_QUERY,
        documentableNodes: DOCUMENTABLE_NODES_QUERY,
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
