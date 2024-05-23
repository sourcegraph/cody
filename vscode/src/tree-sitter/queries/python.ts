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
    ; Note: We also capture @insertion.point here, as we need to determine
    ; the correct start point of the documentation for functions
    ;--------------------------------
    (function_definition
        name: (identifier) @symbol.function
        parameters: _ (":") @insertion.point) @range.function

    ; Class definitions
    ; Note: We also capture @insertion.point here, as we need to determine
    ; the correct start point of the documentation for classes
    ;--------------------------------
    (class_definition
        name: (identifier) @symbol.class
        (":") @insertion.point) @range.class

    ; Assignments
    ;--------------------------------
    (assignment
        left: (identifier) @symbol.identifier) @range.identifier

    ; Comments
    ;--------------------------------
    (expression_statement (string)) @comment
    (comment) @comment
`

const ENCLOSING_FUNCTION_QUERY = dedent`
    (function_definition (identifier) @symbol.function) @range.function
`

export const pythonQueries = {
    [SupportedLanguage.python]: {
        singlelineTriggers: '',
        intents: INTENTS_QUERY,
        documentableNodes: DOCUMENTABLE_NODES_QUERY,
        identifiers: '',
        graphContextIdentifiers: '(call (identifier) @identifier)',
        enclosingFunction: ENCLOSING_FUNCTION_QUERY,
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
