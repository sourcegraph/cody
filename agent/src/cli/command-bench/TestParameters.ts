import type { AutocompleteCompletionItem } from '../../protocol-alias'

import type { AutocompleteParameters } from './triggerAutocomplete'

export interface TestParameters extends AutocompleteParameters {
    item: AutocompleteCompletionItem
    newText: string
}
