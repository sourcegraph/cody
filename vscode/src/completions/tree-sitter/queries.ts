import dedent from 'dedent'

import { SupportedLanguage } from './grammars'

export type QueryName = 'blocks' | 'singlelineTriggers'

const JS_BLOCKS_QUERY = dedent`
    (_ ("{") @block_start) @trigger

    [(try_statement)
    (if_statement)] @parents
`
const TS_SINGLELINE_TRIGGERS_QUERY = dedent`
    (interface_declaration (object_type ("{") @block_start)) @trigger
    (type_alias_declaration (object_type ("{") @block_start)) @trigger
`

export const languages: Partial<Record<SupportedLanguage, Record<QueryName, string>>> = {
    [SupportedLanguage.JavaScript]: {
        blocks: JS_BLOCKS_QUERY,
        singlelineTriggers: '',
    },
    [SupportedLanguage.JSX]: {
        blocks: JS_BLOCKS_QUERY,
        singlelineTriggers: '',
    },
    [SupportedLanguage.TypeScript]: {
        blocks: JS_BLOCKS_QUERY,
        singlelineTriggers: TS_SINGLELINE_TRIGGERS_QUERY,
    },
    [SupportedLanguage.TSX]: {
        blocks: JS_BLOCKS_QUERY,
        singlelineTriggers: TS_SINGLELINE_TRIGGERS_QUERY,
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
    },
} as const
