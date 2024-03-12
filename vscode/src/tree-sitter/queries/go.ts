import dedent from 'dedent'

import { SupportedLanguage } from '../grammars'
import type { QueryName } from '../queries'

export const goQueries = {
    [SupportedLanguage.go]: {
        singlelineTriggers: dedent`
            (struct_type (field_declaration_list ("{") @block_start)) @trigger
            (interface_type ("{") @block_start) @trigger
        `,
        intents: '',
        documentableNodes: '',
        bfgIdentifiers: dedent`
            (identifier) @identifier
            (qualified_type (type_identifier) @identifier)
            (type_spec (type_identifier) @identifier)
            (selector_expression (field_identifier)) @identifier
        `,
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
