import type { AutoEditsTokenLimit, PromptString } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import type {
    AutocompleteContextSnippet,
    DocumentContext,
} from '../../../lib/shared/src/completions/types'
import type * as utils from './prompt-utils'
export type CompletionsPrompt = PromptString
export type ChatPrompt = {
    role: 'system' | 'user' | 'assistant'
    content: PromptString
}[]
export type PromptProviderResponse = CompletionsPrompt | ChatPrompt

export interface PromptResponseData {
    codeToReplace: utils.CodeToReplaceData
    promptResponse: PromptProviderResponse
}

export interface PromptProvider {
    getPrompt(
        docContext: DocumentContext,
        document: vscode.TextDocument,
        context: AutocompleteContextSnippet[],
        tokenBudget: AutoEditsTokenLimit
    ): PromptResponseData

    postProcessResponse(codeToReplace: utils.CodeToReplaceData, completion: string | null): string

    getModelResponse(model: string, apiKey: string, prompt: PromptProviderResponse): Promise<string>
}

export async function getModelResponse(url: string, body: string, apiKey: string): Promise<any> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: body,
    })
    if (response.status !== 200) {
        const errorText = await response.text()
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`)
    }
    const data = await response.json()
    return data
}

// ################################################################################################################
