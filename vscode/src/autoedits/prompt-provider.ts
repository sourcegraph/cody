import type { AutoEditsTokenLimit, PromptString } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import type {
    AutocompleteContextSnippet,
    DocumentContext,
} from '../../../lib/shared/src/completions/types'
import type * as utils from './prompt-utils'

export type ChatPrompt = {
    role: 'system' | 'user' | 'assistant'
    content: PromptString
}[]

export interface AutoeditModelOptions {
    url: string
    model: string
    apiKey: string
    prompt: ChatPrompt
    codeToRewrite: string
    userId: string | null
}

export interface PromptResponseData {
    codeToReplace: utils.CodeToReplaceData
    promptResponse: ChatPrompt
}

export interface AutoeditsModelAdapter {
    getPrompt(
        docContext: DocumentContext,
        document: vscode.TextDocument,
        position: vscode.Position,
        context: AutocompleteContextSnippet[],
        tokenBudget: AutoEditsTokenLimit
    ): PromptResponseData
    getModelResponse(args: AutoeditModelOptions): Promise<string>
    postProcessResponse(codeToReplace: utils.CodeToReplaceData, completion: string | null): string
}

export async function getModelResponse(
    url: string,
    body: string,
    apiKey: string,
    customHeaders: Record<string, string> = {}
): Promise<any> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...customHeaders,
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
