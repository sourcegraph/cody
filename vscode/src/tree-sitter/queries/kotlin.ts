import dedent from 'dedent'

import { SupportedLanguage } from '../grammars'
import type { QueryName } from '../queries'

const DOCUMENTABLE_NODES = dedent`
    ; Function definitions
    ;--------------------------------
    (function_declaration (simple_identifier) @symbol.function) @range.function

	; Variables
    ;--------------------------------
    (class_declaration
    	(type_identifier) @symbol.identifier) @range.identifier
   	(object_declaration
    	(type_identifier) @symbol.identifier) @range.identifier

    ; Types
    ;--------------------------------
    ((type_alias) @symbol.identifier) @range.identifier
`

const ENCLOSING_FUNCTION_QUERY = dedent`
    (function_declaration (simple_identifier) @symbol.function) @range.function
`

export const kotlinQueries = {
    [SupportedLanguage.kotlin]: {
        singlelineTriggers: '',
        intents: '',
        documentableNodes: DOCUMENTABLE_NODES,
        identifiers: '',
        graphContextIdentifiers: '',
        enclosingFunction: ENCLOSING_FUNCTION_QUERY,
    },
} satisfies Partial<Record<SupportedLanguage, Record<QueryName, string>>>
