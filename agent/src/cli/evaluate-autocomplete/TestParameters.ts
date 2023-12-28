import { AutocompleteItem } from '../../protocol-alias'

import { AutocompleteParameters } from './triggerAutocomplete'

export interface TestParameters extends AutocompleteParameters {
    item: AutocompleteItem
    newText: string
}
