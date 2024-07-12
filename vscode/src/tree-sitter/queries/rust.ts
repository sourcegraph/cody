import dedent from 'dedent'

import { SupportedLanguage } from '../grammars'
import type { QueryName } from '../queries'

const DOCUMENTABLE_NODES = dedent`
    ; Function definitions
    ;--------------------------------
    (function_item
        name: (identifier) @symbol.function) @range.function

    ; Variables
    ;--------------------------------
    ((use_declaration) @symbol.identifier) @range.identifier

    ; Types
    ;--------------------------------
    (struct_item
        name: (type_identifier) @symbol.identifier) @range.identifier
    (impl_item
        type: (type_identifier) @symbol.identifier) @range.identifier
    (enum_item
        name: (type_identifier) @symbol.identifier) @range.identifier
    (trait_item
        name: (type_identifier) @symbol.identifier) @range.identifier
`

const ENCLOSING_FUNCTION_QUERY = dedent`
    (function_item name: (identifier) @symbol.function) @range.function
`

export const rustQueries = {
    [SupportedLanguage.rust]: {
        singlelineTriggers: '',
        intents: '',
        documentableNodes: DOCUMENTABLE_NODES,
        identifiers: '',
        graphContextIdentifiers: '',
        enclosingFunction: ENCLOSING_FUNCTION_QUERY,
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
