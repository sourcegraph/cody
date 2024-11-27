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
        const EXISTING_CODE = ps`<CODE7212>`
        const EXISTING_CODE_CLOSE = ps`</CODE7212>`
        const CURSOR_TAG = ps`<CURSOR>`
        const NEW_CODE_TAG = ps`<NEW_CODE>`
        const NEW_CODE_TAG_CLOSE = ps`</NEW_CODE>`
        const SYSTEM_PROMPT = ps`You are a tremendously accurate and skilled coding autocomplete agent. We want to generate new code inside the file '${params.fileName}'.
            The existing code is provided in ${EXISTING_CODE}${EXISTING_CODE_CLOSE} tags.
            The new code you will generate will start at the position of the cursor, which is currently indicated by the ${CURSOR_TAG} tag.
            In your process, first, review the existing code to understand its logic and format. Then, try to determine the best code to generate at the cursor position.
            When generating the new code, please ensure the following:
            1. It is valid code.
            2. It matches the existing code's variable, parameter and function names.
            3. It does not repeat any existing code. Do not repeat code that comes before or after the cursor tags. This includes cases where the cursor is in the middle of a word.
            4. If the cursor is in the middle of a word, it finishes the word instead of repeating code before the cursor tag.
            Return new code enclosed in ${NEW_CODE_TAG}${NEW_CODE_TAG_CLOSE} tags. We will then insert this at the ${CURSOR_TAG} position.
            If you are not able to write code based on the given instructions return an empty result like ${NEW_CODE_TAG}${NEW_CODE_TAG_CLOSE}. Here is the code:
        `

        const { prefix, suffix } = params

        const { head, tail } = getHeadAndTail(prefix)
        const infillBlock = tail.trimmed.toString().endsWith('{\n')
            ? tail.trimmed.trimEnd()
            : tail.trimmed

        const infillPrefix = head.raw || ''
        const prompt = ps`${SYSTEM_PROMPT}
        ${EXISTING_CODE}
        ${infillPrefix}
        ${infillBlock}
        ${CURSOR_TAG}
        ${suffix}
        ${EXISTING_CODE_CLOSE}
        `
        return prompt
    }

    private removeBadCompletionEnd(content: string): string {
        return content.replaceAll(`${CLOSING_CODE_TAG}`, '')
    }

    public postProcess(content: string, docContext: DocumentContext): string {
        let completion = extractFromCodeBlock(content)
        completion = completion.replace(/^\s*```[\s\S]*?\n/, '').replace(/```$/, '').trim()

        // Remove <NEW_CODE> and </NEW_CODE> tags
        completion = completion.replace(/<NEW_CODE>/g, '').replace(/<\/NEW_CODE>/g, '')

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
        console.log("the actual generated completion", completion)
        return completion
    }
}
