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
        ps`You are a code completion AI designed to take the surrounding code and shared context into account in order to predict and suggest high-quality code to complete the code enclosed in ${OPENING_CODE_TAG} tags.  You only respond with code that works and fits seamlessly with surrounding code. Do not include anything else beyond the code.`

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

        return ps`Below is the code from file path ${fileName}. Review the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations. Here is the code:\n\`\`\`\n${intro}${infillPrefix}${OPENING_CODE_TAG}${CLOSING_CODE_TAG}${suffix}\n\`\`\`

${OPENING_CODE_TAG}${infillBlock}`
    }

    public postProcess(content: string, docContext: DocumentContext): string {
        let completion = extractFromCodeBlock(content)

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

        return completion
    }
}
