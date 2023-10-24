import dedent from 'dedent'

import { SupportedLanguage } from './grammars'

export type QueryName = 'blocks' | 'singlelineTriggers' | 'intents'

const JS_BLOCKS_QUERY = dedent`
    (_ ("{") @block_start) @trigger

    [(try_statement)
    (if_statement)] @parents
`

/**
 * Completion intents sorted by priority.
 * Top-most items are used if capture group ranges are identical.
 */
export const intentPriority = [
    'function.name',
    'function.parameters',
    'function.body',
    'type_declaration.name',
    'type_declaration.body',
    'arguments',
    'block_statement',
    'import.source',
    'comment',
    'argument',
    'parameters',
    'return_statement',
    'string',
] as const

/**
 * Completion intent label derived from the AST nodes before the cursor.
 */
export type CompletionIntent = (typeof intentPriority)[number]

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
 * TODO: classes, try/catch, members, if/else, loops, etc.
 * Tracking: https://github.com/sourcegraph/cody/issues/1456
 */
const JS_INTENTS_QUERY = dedent`
    ; Cursor dependent intents
    ;--------------------------------

    (function_declaration
        name: (identifier) @function.name!
        parameters: (formal_parameters ("(") @function.parameters.cursor) @function.parameters
        body: (statement_block ("{") @function.body.cursor) @function.body)

    (function
        name: (identifier) @function.name!
        parameters: (formal_parameters ("(") @function.parameters.cursor) @function.parameters
        body: (statement_block ("{") @function.body.cursor) @function.body)

    (arrow_function
        parameters: (formal_parameters ("(") @function.parameters.cursor) @function.parameters
        body: (statement_block ("{") @function.body.cursor) @function.body)

    (_ ("{") @block_statement.cursor) @block_statement
    (arguments ("(") @arguments.cursor) @arguments

    ; Atomic intents
    ;--------------------------------

    (import_statement
        source: (string) @import.source!)

    (comment) @comment!
    (arguments (_) @argument!)
    (formal_parameters) @parameters!
    (return_statement) @return_statement!
    [(string) (string_fragment) (template_string)] @string!
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
        body: (object_type ("{") @type_declaration.body.cursor) @type_declaration.body)

    (type_alias_declaration
        name: (type_identifier) @type_declaration.name!
        value: (object_type ("{") @type_declaration.body.cursor) @type_declaration.body)
`

const TS_SINGLELINE_TRIGGERS_QUERY = dedent`
    (interface_declaration (object_type ("{") @block_start)) @trigger
    (type_alias_declaration (object_type ("{") @block_start)) @trigger
`

export const languages: Partial<Record<SupportedLanguage, Record<QueryName, string>>> = {
    [SupportedLanguage.JavaScript]: {
        blocks: JS_BLOCKS_QUERY,
        singlelineTriggers: '',
        intents: JS_INTENTS_QUERY,
    },
    [SupportedLanguage.JSX]: {
        blocks: JS_BLOCKS_QUERY,
        singlelineTriggers: '',
        intents: JS_INTENTS_QUERY,
    },
    [SupportedLanguage.TypeScript]: {
        blocks: JS_BLOCKS_QUERY,
        singlelineTriggers: TS_SINGLELINE_TRIGGERS_QUERY,
        intents: TS_INTENTS_QUERY,
    },
    [SupportedLanguage.TSX]: {
        blocks: JS_BLOCKS_QUERY,
        singlelineTriggers: TS_SINGLELINE_TRIGGERS_QUERY,
        intents: TS_INTENTS_QUERY,
    },
    [SupportedLanguage.Go]: {
        blocks: dedent`
            (_ ("{") @block_start) @trigger

            [(if_statement)] @parents
        `,
        singlelineTriggers: dedent`
            (struct_type (field_declaration_list ("{") @block_start)) @trigger
            (interface_type ("{") @block_start) @trigger
        `,
        intents: '',
    },
} as const
