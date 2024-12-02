import type { PromptString } from '@sourcegraph/cody-shared'
import type * as utils from './prompt-utils'

export type AutoeditsPrompt = {
    systemMessage: PromptString
    userMessage: PromptString
}

export interface AutoeditModelOptions {
    url: string
    model: string
    apiKey: string
    prompt: AutoeditsPrompt
    codeToRewrite: string
    userId: string | null
    isChatModel: boolean
}

export interface PromptResponseData {
    codeToReplace: utils.CodeToReplaceData
    promptResponse: AutoeditsPrompt
}

export interface AutoeditsModelAdapter {
    getModelResponse(args: AutoeditModelOptions): Promise<string>
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
