import dedent from 'dedent'

import { SupportedLanguage } from '../grammars'
import type { QueryName } from '../queries'

/**
 * Incomplete code cases to cover:
 *
 * 1. call_expression: example(
 * 2. formal_parameters: function example(
 * 3. import_statement: import react
 * 4. lexical_declaration: const foo =
 *
 * The capture group name ending with "!" means this capture group does not require
 * a specific cursor position to match.
 *
 * TODO: try/catch, members, if/else, loops, etc.
 * Tracking: https://github.com/sourcegraph/cody/issues/1456
 */
const JS_INTENTS_QUERY = dedent`
    ; Cursor dependent intents
    ;--------------------------------

    (function_declaration
        name: (identifier) @function.name!
        parameters: (formal_parameters ("(") @function.parameters.cursor) @function.parameters
        body: (statement_block ("{") @function.body.cursor) @function.body)

    (function_expression
        name: (identifier) @function.name!
        parameters: (formal_parameters ("(") @function.parameters.cursor) @function.parameters
        body: (statement_block ("{") @function.body.cursor) @function.body)

    (arrow_function
        parameters: (formal_parameters ("(") @function.parameters.cursor) @function.parameters
        body: (statement_block ("{") @function.body.cursor) @function.body)

    (class_declaration
        name: (_) @class.name!
        body: (class_body ("{") @class.body.cursor) @class.body)

    (arguments ("(") @arguments.cursor) @arguments

    ; Atomic intents
    ;--------------------------------

    (comment) @comment!
    (import_statement
        source: (string) @import.source!)

    (pair
        value: [
            (string (_)*)
            (template_string)
            (number)
            (identifier)
            (true)
            (false)
            (null)
            (undefined)
        ] @pair.value!)

    (arguments
        [
            (string (_)*)
            (template_string)
            (number)
            (identifier)
            (true)
            (false)
            (null)
            (undefined)
        ] @argument!)

    (formal_parameters) @parameters!
    (formal_parameters (_) @parameter!)

    (return_statement) @return_statement!
    (return_statement
        [
            (string (_)*)
            (template_string)
            (number)
            (identifier)
            (true)
            (false)
            (null)
            (undefined)
        ] @return_statement.value!)
`

const JSX_INTENTS_QUERY = dedent`
    ${JS_INTENTS_QUERY}

    (jsx_attribute (_) @jsx_attribute.value!)
`

const TS_INTENTS_QUERY = dedent`
    ${JS_INTENTS_QUERY}

    ; Cursor dependent intents
    ;--------------------------------

    (function_signature
        name: (identifier) @function.name!
        parameters: (formal_parameters ("(") @function.parameters.cursor) @function.parameters)

    (interface_declaration
        name: (type_identifier) @type_declaration.name!
        body: (interface_body ("{") @type_declaration.body.cursor) @type_declaration.body)

    (type_alias_declaration
        name: (type_identifier) @type_declaration.name!
        value: (object_type ("{") @type_declaration.body.cursor) @type_declaration.body)
`

const TSX_INTENTS_QUERY = dedent`
    ${TS_INTENTS_QUERY}

    (jsx_attribute (_) @jsx_attribute.value!)
`

const TS_SINGLELINE_TRIGGERS_QUERY = dedent`
    (interface_declaration (interface_body ("{") @block_start)) @trigger
    (type_alias_declaration (object_type ("{") @block_start)) @trigger
`

const JS_DOCUMENTABLE_NODES_QUERY = dedent`
    ; Identifiers
    ;--------------------------------
    (_ name: (identifier) @symbol) @span

    ; Property Identifiers
    ;--------------------------------
    (method_definition
        name: (property_identifier) @symbol) @span
    (pair
        key: (property_identifier) @symbol) @span
`

const TS_DOCUMENTABLE_NODES_QUERY = dedent`
    ${JS_DOCUMENTABLE_NODES_QUERY}

    ; Type Identifiers
    ;--------------------------------
    (_
        name: (type_identifier) @symbol) @span

    ; Type Signatures
    ;--------------------------------
    ((call_signature) @symbol) @span
    (interface_declaration
        (interface_body
            (property_signature
                name: (property_identifier) @symbol))) @span
    (interface_declaration
        (interface_body
            (method_signature
                name: (property_identifier) @symbol))) @span
    (type_alias_declaration
        (object_type
            (property_signature
                name: (property_identifier) @sybmol))) @span
`

const JS_TESTABLE_NODES_QUERY = dedent`
    ; Function Identifiers
    ;--------------------------------
    (_ name: (identifier) @symbol.function value: (arrow_function)) @span
    (_ key: (property_identifier) @symbol.function value: (arrow_function)) @span

    ; TODO Fix
    ; (_ key: (property_identifier) @symbol.function value: (function_expression)) @span

    ; Function Declarations
    ;--------------------------------
    (method_definition name: (property_identifier) @symbol.function) @span
    (function_declaration name: (identifier) @symbol.function) @span
    (generator_function_declaration name: (identifier) @symbol.function) @span
`

/** TOOD: Anything different required? */
const TS_TESTABLE_NODES_QUERY = dedent`
    ${JS_TESTABLE_NODES_QUERY}
`

export const javascriptQueries = {
    [SupportedLanguage.javascript]: {
        singlelineTriggers: '',
        intents: JS_INTENTS_QUERY,
        documentableNodes: JS_DOCUMENTABLE_NODES_QUERY,
        testableNodes: JS_TESTABLE_NODES_QUERY,
    },
    [SupportedLanguage.javascriptreact]: {
        singlelineTriggers: '',
        intents: JSX_INTENTS_QUERY,
        documentableNodes: JS_DOCUMENTABLE_NODES_QUERY,
        testableNodes: JS_TESTABLE_NODES_QUERY,
    },
    [SupportedLanguage.typescript]: {
        singlelineTriggers: TS_SINGLELINE_TRIGGERS_QUERY,
        intents: TS_INTENTS_QUERY,
        documentableNodes: TS_DOCUMENTABLE_NODES_QUERY,
        testableNodes: TS_TESTABLE_NODES_QUERY,
    },
    [SupportedLanguage.typescriptreact]: {
        singlelineTriggers: TS_SINGLELINE_TRIGGERS_QUERY,
        intents: TSX_INTENTS_QUERY,
        documentableNodes: TS_DOCUMENTABLE_NODES_QUERY,
        testableNodes: TS_TESTABLE_NODES_QUERY,
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
