import { type AutocompleteContextSnippet, PromptString, ps } from '@sourcegraph/cody-shared'
import { RetrieverIdentifier } from '../../../completions/context/utils'
import * as constants from '../constants'
import {
    getContextItemsForIdentifier,
    getContextPromptWithPath,
    joinPromptsWithNewlineSeparator,
} from './common'

export function getJaccardSimilarityPrompt(contextItems: AutocompleteContextSnippet[]): PromptString {
    const jaccardSimilarity = getContextItemsForIdentifier(
        contextItems,
        RetrieverIdentifier.JaccardSimilarityRetriever
    )
    if (jaccardSimilarity.length === 0) {
        return ps``
    }
    const jaccardSimilarityPrompts = jaccardSimilarity.map(item =>
        joinPromptsWithNewlineSeparator([
            constants.SNIPPET_TAG_OPEN,
            getContextPromptWithPath(
                PromptString.fromDisplayPath(item.uri),
                PromptString.fromAutocompleteContextSnippet(item).content
            ),
            constants.SNIPPET_TAG_CLOSE,
        ])
    )

    const snippetsPrompt = joinPromptsWithNewlineSeparator(jaccardSimilarityPrompts)
    return joinPromptsWithNewlineSeparator([
        constants.EXTRACTED_CODE_SNIPPETS_TAG_OPEN,
        snippetsPrompt,
        constants.EXTRACTED_CODE_SNIPPETS_TAG_CLOSE,
    ])
}
