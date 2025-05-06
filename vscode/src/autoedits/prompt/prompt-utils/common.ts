import {
    type AutocompleteContextSnippet,
    PromptString,
    ps,
    tokensToChars,
} from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { getActiveNotebookUri } from '../../../completions/context/retrievers/recent-user-actions/notebook-utils'
import type { RetrieverIdentifier } from '../../../completions/context/utils'
import { autoeditsOutputChannelLogger } from '../../output-channel-logger'

//  Helper functions
export function getContextItemMappingWithTokenLimit(
    contextItems: AutocompleteContextSnippet[],
    contextTokenLimitMapping: Record<string, number>,
    contextNumItemsLimitMapping: Record<string, number>
): Map<RetrieverIdentifier, AutocompleteContextSnippet[]> {
    const contextItemMapping = new Map<RetrieverIdentifier, AutocompleteContextSnippet[]>()
    // Group items by identifier
    for (const item of contextItems) {
        const identifier = item.identifier as RetrieverIdentifier
        if (!contextItemMapping.has(identifier)) {
            contextItemMapping.set(identifier, [])
        }
        contextItemMapping.get(identifier)!.push(item)
    }
    // Apply token limits
    for (const [identifier, items] of contextItemMapping) {
        const tokenLimit =
            identifier in contextTokenLimitMapping ? contextTokenLimitMapping[identifier] : undefined
        const numItemsLimit =
            identifier in contextNumItemsLimitMapping
                ? contextNumItemsLimitMapping[identifier]
                : undefined

        if (tokenLimit !== undefined) {
            contextItemMapping.set(
                identifier,
                getContextItemsInTokenBudget(items, tokenLimit, numItemsLimit)
            )
        } else {
            autoeditsOutputChannelLogger.logError(
                'getContextItemMappingWithTokenLimit',
                `No token limit for ${identifier}`
            )
            contextItemMapping.set(identifier, [])
        }
    }
    return contextItemMapping
}

export function getContextItemsInTokenBudget(
    contextItems: AutocompleteContextSnippet[],
    tokenBudget: number,
    numItemsLimit?: number
): AutocompleteContextSnippet[] {
    const autocompleteItemsWithBudget: AutocompleteContextSnippet[] = []
    let currentCharsCount = 0
    const charsBudget = tokensToChars(tokenBudget)

    for (let i = 0; i < contextItems.length; i++) {
        const item = contextItems[i]
        if (currentCharsCount + item.content.length > charsBudget) {
            continue
        }
        currentCharsCount += item.content.length
        autocompleteItemsWithBudget.push(item)
        if (numItemsLimit && autocompleteItemsWithBudget.length >= numItemsLimit) {
            break
        }
    }
    return autocompleteItemsWithBudget
}

export function getCompletionsPromptWithSystemPrompt(
    systemPrompt: PromptString,
    userPrompt: PromptString
): PromptString {
    // The models are offline fine-tuned on this prompt. It is important to keep it consistent.
    return ps`${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`
}

export function getPromptWithNewline(prompt: PromptString): PromptString {
    if (prompt.length === 0) {
        return ps``
    }
    return ps`${prompt}\n`
}

export function getPromptForTheContextSource(
    contextItems: AutocompleteContextSnippet[],
    instructionPrompt: PromptString,
    callback: (contextItems: AutocompleteContextSnippet[]) => PromptString
): PromptString {
    const prompt = callback(contextItems)
    if (contextItems.length === 0 || prompt.length === 0) {
        return ps``
    }
    return ps`${instructionPrompt}\n${prompt}`
}

export function trimNewLineCharIfExists(prompt: PromptString): PromptString {
    if (prompt.toString().endsWith('\n')) {
        return prompt.slice(0, -1)
    }
    return prompt
}

export function getCurrentFilePath(document: vscode.TextDocument): PromptString {
    const uri =
        document.uri.scheme === 'vscode-notebook-cell'
            ? getActiveNotebookUri() ?? document.uri
            : document.uri
    return PromptString.fromDisplayPath(uri)
}

export function getContextItemsForIdentifier(
    contextItems: AutocompleteContextSnippet[],
    identifier: string
): AutocompleteContextSnippet[] {
    return contextItems.filter(item => item.identifier === identifier)
}

export function getContextPromptWithPath(filePath: PromptString, content: PromptString): PromptString {
    return ps`(\`${filePath}\`)\n\n${content}`
}

export function joinPromptsWithNewlineSeparator(
    prompts: PromptString[],
    separator = ps`\n`
): PromptString {
    const validPrompts = prompts.filter(args => args.length > 0)
    return PromptString.join(validPrompts, separator)
}
