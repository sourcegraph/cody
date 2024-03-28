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
    ; Functions
    ;--------------------------------
    (function_declaration
        name: (identifier) @symbol.function) @range.function
    (generator_function_declaration
        name: (identifier) @symbol.function) @range.function
    (function_expression
        name: (identifier) @symbol.function) @range.function

    ; Variables
    ;--------------------------------
    (lexical_declaration
        (variable_declarator
            name: (identifier) @symbol.identifier)) @range.identifier
    (variable_declaration
        (variable_declarator
            name: (identifier) @symbol.identifier)) @range.identifier
    (class_declaration
        name: (_) @symbol.identifier) @range.identifier

    ; Property Identifiers
    ;--------------------------------
    (method_definition
        name: (property_identifier) @symbol.function) @range.function
    (pair
        key: (property_identifier) @symbol.identifier) @range.identifier
`

const TS_DOCUMENTABLE_NODES_QUERY = dedent`
    ${JS_DOCUMENTABLE_NODES_QUERY}

    ; Property identifiers
    ;--------------------------------
    (public_field_definition
        name: (property_identifier) @symbol.identifier) @range.identifier

    ; Type Identifiers
    ;--------------------------------
    (interface_declaration
        name: (type_identifier) @symbol.identifier) @range.identifier
    (type_alias_declaration
        name: (type_identifier) @symbol.identifier) @range.identifier
    (enum_declaration
        name: (identifier) @symbol.identifier) @range.identifier

    ; Type Signatures
    ;--------------------------------
    ((call_signature) @symbol.function) @range.function
    (function_signature
        name: (identifier) @symbol.function) @range.function
    (interface_declaration
        (interface_body
            (property_signature name: (property_identifier) @symbol.identifier) @range.identifier))
    (interface_declaration
        (interface_body
            (method_signature name: (property_identifier) @symbol.identifier) @range.identifier))
    (type_alias_declaration
        (object_type
            (property_signature name: (property_identifier) @symbol.identifier) @range.identifier))
`

const JS_SHARED_CONTEXT_IDENTIFIERS_QUERY = dedent`
    (import_clause (identifier) @identifier)
    (import_specifier (identifier) @identifier)
    (call_expression function: (identifier) @identifier)
    (expression_statement (identifier) @identifier)
    (new_expression constructor: (identifier) @identifier)
    (member_expression (property_identifier) @identifier)
    (pair (property_identifier) @identifier)
    (variable_declarator value: (identifier) @identifier)
    (labeled_statement body: (expression_statement (identifier) @identifier))
    (labeled_statement body: (expression_statement (_ (identifier) @identifier)))
`

const JS_GRAPH_CONTEXT_IDENTIFIERS_QUERY = dedent`
    ${JS_SHARED_CONTEXT_IDENTIFIERS_QUERY}
    (class_heritage (identifier) @identifier)
`

const JSX_GRAPH_CONTEXT_IDENTIFIERS_QUERY = dedent`
    ${JS_SHARED_CONTEXT_IDENTIFIERS_QUERY}
    (jsx_attribute (property_identifier) @identifier)
`

const TS_GRAPH_CONTEXT_IDENTIFIERS_QUERY = dedent`
    ${JS_SHARED_CONTEXT_IDENTIFIERS_QUERY}
    (extends_clause (identifier) @identifier)
    (type_identifier) @identifier
`

const TSX_GRAPH_CONTEXT_IDENTIFIERS_QUERY = dedent`
    ${TS_GRAPH_CONTEXT_IDENTIFIERS_QUERY}
    (jsx_attribute (property_identifier) @identifier)
`

const JS_ENCLOSING_FUNCTION_QUERY = dedent`
    (function_declaration) @range.function
    (generator_function_declaration) @range.function
    (function_expression) @range.function
    (arrow_function) @range.function
    (method_definition) @range.function
`

export const javascriptQueries = {
    [SupportedLanguage.javascript]: {
        singlelineTriggers: '',
        intents: JS_INTENTS_QUERY,
        documentableNodes: JS_DOCUMENTABLE_NODES_QUERY,
        graphContextIdentifiers: JS_GRAPH_CONTEXT_IDENTIFIERS_QUERY,
        enclosingFunction: JS_ENCLOSING_FUNCTION_QUERY,
    },
    [SupportedLanguage.javascriptreact]: {
        singlelineTriggers: '',
        intents: JSX_INTENTS_QUERY,
        documentableNodes: JS_DOCUMENTABLE_NODES_QUERY,
        graphContextIdentifiers: JSX_GRAPH_CONTEXT_IDENTIFIERS_QUERY,
        enclosingFunction: JS_ENCLOSING_FUNCTION_QUERY,
    },
    [SupportedLanguage.typescript]: {
        singlelineTriggers: TS_SINGLELINE_TRIGGERS_QUERY,
        intents: TS_INTENTS_QUERY,
        documentableNodes: TS_DOCUMENTABLE_NODES_QUERY,
        graphContextIdentifiers: TS_GRAPH_CONTEXT_IDENTIFIERS_QUERY,
        enclosingFunction: JS_ENCLOSING_FUNCTION_QUERY,
    },
    [SupportedLanguage.typescriptreact]: {
        singlelineTriggers: TS_SINGLELINE_TRIGGERS_QUERY,
        intents: TSX_INTENTS_QUERY,
        documentableNodes: TS_DOCUMENTABLE_NODES_QUERY,
        graphContextIdentifiers: TSX_GRAPH_CONTEXT_IDENTIFIERS_QUERY,
        enclosingFunction: JS_ENCLOSING_FUNCTION_QUERY,
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
