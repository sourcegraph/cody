import type { AutoEditsTokenLimit } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import type {
    AutocompleteContextSnippet,
    DocumentContext,
} from '../../../../lib/shared/src/completions/types'
import { autoeditsLogger } from '../logger'
import type {
    ChatPrompt,
    PromptProvider,
    PromptProviderResponse,
    PromptResponseData,
} from '../prompt-provider'
import { getModelResponse } from '../prompt-provider'
import { type CodeToReplaceData, SYSTEM_PROMPT, getBaseUserPrompt } from '../prompt-utils'

export class OpenAIPromptProvider implements PromptProvider {
    getPrompt(
        docContext: DocumentContext,
        document: vscode.TextDocument,
        position: vscode.Position,
        context: AutocompleteContextSnippet[],
        tokenBudget: AutoEditsTokenLimit
    ): PromptResponseData {
        const { codeToReplace, promptResponse: userPrompt } = getBaseUserPrompt(
            docContext,
            document,
            position,
            context,
            tokenBudget
        )
        const prompt: ChatPrompt = [
            {
                role: 'system',
                content: SYSTEM_PROMPT,
            },
            {
                role: 'user',
                content: userPrompt,
            },
        ]
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
                'https://api.openai.com/v1/chat/completions',
                JSON.stringify({
                    model: model,
                    messages: prompt,
                    temperature: 0.5,
                    max_tokens: 256,
                    response_format: {
                        type: 'text',
                    },
                }),
                apiKey
            )
            return response.choices[0].message.content
        } catch (error) {
            autoeditsLogger.logDebug('AutoEdits', 'Error calling OpenAI API:', error)
            throw error
        }
    }
}
