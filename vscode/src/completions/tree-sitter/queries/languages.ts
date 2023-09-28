import dedent from 'dedent'

import { SupportedLanguage } from '../grammars'

export type QueryName = 'blocks'

const JS_BLOCKS_QUERY = dedent`
    (_ ("{")) @blocks

    [(try_statement)
    (if_statement)] @parents
`

export const languages: Partial<Record<SupportedLanguage, Record<QueryName, string>>> = {
    [SupportedLanguage.JavaScript]: {
        blocks: JS_BLOCKS_QUERY,
    },
    [SupportedLanguage.TypeScript]: {
        blocks: JS_BLOCKS_QUERY,
    },
    [SupportedLanguage.JSX]: {
        blocks: JS_BLOCKS_QUERY,
    },
    [SupportedLanguage.TSX]: {
        blocks: JS_BLOCKS_QUERY,
    },
} as const
