import { type AutocompleteContextSnippet, PromptString, ps } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { RetrieverIdentifier } from '../../../completions/context/utils'
import * as constants from '../constants'
import {
    getContextItemsForIdentifier,
    getContextPromptWithPath,
    joinPromptsWithNewlineSeparator,
} from './common'

export function getLintErrorsPrompt(contextItems: AutocompleteContextSnippet[]): PromptString {
    const lintErrors = getContextItemsForIdentifier(
        contextItems,
        RetrieverIdentifier.DiagnosticsRetriever
    )
    if (lintErrors.length === 0) {
        return ps``
    }

    // Create a mapping of URI to AutocompleteContextSnippet[]
    const uriToSnippetsMap = new Map<string, AutocompleteContextSnippet[]>()
    for (const item of lintErrors) {
        const uriString = item.uri.toString()
        if (!uriToSnippetsMap.has(uriString)) {
            uriToSnippetsMap.set(uriString, [])
        }
        uriToSnippetsMap.get(uriString)!.push(item)
    }

    // Combine snippets for each URI
    const combinedPrompts: PromptString[] = []
    for (const [uriString, snippets] of uriToSnippetsMap) {
        const uri = vscode.Uri.parse(uriString)
        const snippetContents = snippets.map(
            item => PromptString.fromAutocompleteContextSnippet(item).content
        )
        const combinedContent = joinPromptsWithNewlineSeparator(snippetContents, ps`\n\n`)
        const promptWithPath = getContextPromptWithPath(
            PromptString.fromDisplayPath(uri),
            combinedContent
        )
        combinedPrompts.push(promptWithPath)
    }

    const lintErrorsPrompt = joinPromptsWithNewlineSeparator(combinedPrompts, ps`\n\n`)
    return joinPromptsWithNewlineSeparator([
        constants.LINT_ERRORS_TAG_OPEN,
        lintErrorsPrompt,
        constants.LINT_ERRORS_TAG_CLOSE,
    ])
}
