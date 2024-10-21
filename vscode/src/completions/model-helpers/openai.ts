import { type DocumentContext, type PromptString, ps } from '@sourcegraph/cody-shared'

import {
    CLOSING_CODE_TAG,
    OPENING_CODE_TAG,
    extractFromCodeBlock,
    fixBadCompletionStart,
    getHeadAndTail,
    trimLeadingWhitespaceUntilNewline,
} from '../text-processing'
import {
    DefaultModel,
    type FormatPromptParams,
    type GetDefaultIntroSnippetsParams,
    type GetOllamaPromptParams,
} from './default'

export class OpenAI extends DefaultModel {
    public stopSequences = [CLOSING_CODE_TAG.toString()]

    private instructions =
        ps`You are a code completion AI designed to take the surrounding code and shared context into account in order to predict and suggest high-quality code to complete the code enclosed in ${OPENING_CODE_TAG} tags and ${CLOSING_CODE_TAG}.  You only respond with code that works and fits seamlessly with surrounding code and do not include the markers or tags in the response.`

    getOllamaPrompt(promptContext: GetOllamaPromptParams): PromptString {
        throw new Error('OpenAI is not supported by the Ollama provider yet!')
    }

    protected getDefaultIntroSnippets(params: GetDefaultIntroSnippetsParams): PromptString[] {
        return [this.instructions]
    }

    formatPrompt(params: FormatPromptParams): PromptString {
        const { intro, prefix, suffix, fileName } = params

        const { head, tail } = getHeadAndTail(prefix)
        const infillBlock = tail.trimmed.toString().endsWith('{\n')
            ? tail.trimmed.trimEnd()
            : tail.trimmed

        const infillPrefix = head.raw || ''

        return ps`${intro} Below is the code from file path ${fileName}. Complete the code between ${OPENING_CODE_TAG} and ${CLOSING_CODE_TAG}. Do not include the markers or opening and closing tags in your response. Here is the code:
\`\`\`
${infillPrefix}${OPENING_CODE_TAG}${CLOSING_CODE_TAG}${suffix}
\`\`\`
${OPENING_CODE_TAG}${infillBlock}`
    }
    private removeBadCompletionEnd(content: string): string {
        return content.replaceAll(`${CLOSING_CODE_TAG}`, '')
    }

    public postProcess(content: string, docContext: DocumentContext): string {
        let completion = extractFromCodeBlock(content)
        completion = content.replace(/^\s*```[\s\S]*?\n/, '').replace(/```$/, '').trim()

        const trimmedPrefixContainNewline = docContext.prefix
            .slice(docContext.prefix.trimEnd().length)
            .includes('\n')
        if (trimmedPrefixContainNewline) {
            // The prefix already contains a `\n` that LLM was not aware of, so we remove any
            // leading `\n` followed by whitespace that might be add.
            completion = completion.replace(/^\s*\n\s*/, '')
        } else {
            completion = trimLeadingWhitespaceUntilNewline(completion)
        }

        // Remove bad symbols from the start of the completion string.
        completion = fixBadCompletionStart(completion)

        completion = this.removeBadCompletionEnd(completion)
        console.log("the actual geneated completion", completion)
        return completion
    }
}
