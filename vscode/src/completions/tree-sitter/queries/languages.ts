import dedent from 'dedent'

import { SupportedLanguage } from '../grammars'

export type QueryName = 'blocks'

export const languages: Partial<Record<SupportedLanguage, Record<QueryName, string>>> = {
    [SupportedLanguage.JavaScript]: {
        blocks: dedent`
            (_ ("{")) @blocks

            [(try_statement)
            (if_statement)] @parents
        `,
    },
    [SupportedLanguage.TypeScript]: {
        blocks: dedent`
            (_ ("{")) @blocks

            [(try_statement)
            (if_statement)] @parents
        `,
    },
    [SupportedLanguage.JSX]: {
        blocks: dedent`
            (_ ("{")) @blocks

            [(try_statement)
            (if_statement)] @parents
        `,
    },
    [SupportedLanguage.TSX]: {
        blocks: dedent`
            (_ ("{")) @blocks

            [(try_statement)
            (if_statement)] @parents
        `,
    },
} as const
