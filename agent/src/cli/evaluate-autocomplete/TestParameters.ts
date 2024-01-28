import type { AutocompleteItem } from '../../protocol-alias'

import type { AutocompleteParameters } from './triggerAutocomplete'

export interface TestParameters extends AutocompleteParameters {
    item: AutocompleteItem
    newText: string
}
