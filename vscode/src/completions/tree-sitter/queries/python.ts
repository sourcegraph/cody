import dedent from 'dedent'

import { SupportedLanguage } from '../grammars'
import type { QueryName } from '../queries'

export const pythonQueries = {
    [SupportedLanguage.Python]: {
        blocks: dedent`
            (_(":") @block_start) @trigger
        `,
        singlelineTriggers: '',
        intents: '',
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
