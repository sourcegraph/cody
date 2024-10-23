import { type AutoEditsTokenLimit, type PromptString, logDebug, ps } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import type {
    AutocompleteContextSnippet,
    DocumentContext,
} from '../../../../lib/shared/src/completions/types'
import type { PromptProvider, PromptProviderResponse, PromptResponseData } from '../prompt-provider'
import { getModelResponse } from '../prompt-provider'
import { type CodeToReplaceData, SYSTEM_PROMPT, getBaseUserPrompt } from '../prompt-utils'

export class DeepSeekPromptProvider implements PromptProvider {
    private readonly bosToken: PromptString = ps`<｜begin▁of▁sentence｜>`
    private readonly userToken: PromptString = ps`User: `
    private readonly assistantToken: PromptString = ps`Assistant: `

    getPrompt(
        docContext: DocumentContext,
        document: vscode.TextDocument,
        context: AutocompleteContextSnippet[],
        tokenBudget: AutoEditsTokenLimit
    ): PromptResponseData {
        const { codeToReplace, promptResponse: userPrompt } = getBaseUserPrompt(
            docContext,
            document,
            context,
            tokenBudget
        )
        const prompt = ps`${this.bosToken}${SYSTEM_PROMPT}

${this.userToken}${userPrompt}

${this.assistantToken}`

        return {
            codeToReplace: codeToReplace,
            promptResponse: prompt,
        }
    }

    postProcessResponse(codeToReplace: CodeToReplaceData, response: string): string {
        return response
    }

    async getModelResponse(
        model: string,
        apiKey: string,
        prompt: PromptProviderResponse
    ): Promise<string> {
        try {
            const response = await getModelResponse(
                'https://api.fireworks.ai/inference/v1/completions',
                JSON.stringify({
                    model: model,
                    prompt: prompt.toString(),
                    temperature: 0.5,
                    max_tokens: 256,
                }),
                apiKey
            )
            return response.choices[0].text
        } catch (error) {
            logDebug('AutoEdits', 'Error calling Fireworks API:', error)
            throw error
        }
    }
}
