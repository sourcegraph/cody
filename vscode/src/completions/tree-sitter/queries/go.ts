import dedent from 'dedent'

import { SupportedLanguage } from '../grammars'
import type { QueryName } from '../queries'

export const goQueries = {
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
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
