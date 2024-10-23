import { type AutoEditsTokenLimit, logDebug } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import type {
    AutocompleteContextSnippet,
    DocumentContext,
} from '../../../../lib/shared/src/completions/types'
import { lines } from '../../completions/text-processing'
import type {
    ChatPrompt,
    PromptProvider,
    PromptProviderResponse,
    PromptResponseData,
} from '../prompt-provider'
import { getModelResponse } from '../prompt-provider'
import { type CodeToReplaceData, SYSTEM_PROMPT, getBaseUserPrompt } from '../prompt-utils'

export class FireworksPromptProvider implements PromptProvider {
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
        // todo (hitesh): The finetuned model is messing up the identation of the first line.
        // todo: correct it manully for now, by checking the first line of the code to rewrite and adding the same indentation to the first line of the completion
        const codeToRewrite = codeToReplace.codeToRewrite.toString()
        const codeToRewriteLines = lines(codeToRewrite)
        const completionLines = lines(response)
        const firstLineMatch = codeToRewriteLines[0].match(/^(\s*)/)
        const firstLineIndentation = firstLineMatch ? firstLineMatch[1] : ''
        completionLines[0] = firstLineIndentation + completionLines[0].trimLeft()
        const completion = completionLines.join('\n')
        return completion
    }

    async getModelResponse(
        model: string,
        apiKey: string,
        prompt: PromptProviderResponse
    ): Promise<string> {
        try {
            const response = await getModelResponse(
                'https://sourcegraph-6c39ed29.direct.fireworks.ai/v1/chat/completions',
                JSON.stringify({
                    model: model,
                    messages: prompt,
                    temperature: 0.2,
                    max_tokens: 256,
                    response_format: {
                        type: 'text',
                    },
                }),
                apiKey
            )
            return response.choices[0].message.content
        } catch (error) {
            logDebug('AutoEdits', 'Error calling OpenAI API:', error)
            throw error
        }
    }
}
