import * as anthropic from '@anthropic-ai/sdk'

import {
    type AutocompleteContextSnippet,
    type AutocompleteSymbolContextSnippet,
    type DocumentContext,
    type Message,
    PromptString,
    ps,
} from '@sourcegraph/cody-shared'

import {
    CLOSING_CODE_TAG,
    OPENING_CODE_TAG,
    extractFromCodeBlock,
    fixBadCompletionStart,
    getHeadAndTail,
    trimLeadingWhitespaceUntilNewline,
} from '../text-processing'
import { messagesToText } from '../utils'
import { DefaultModel, type GetOllamaPromptParams, type GetPromptParams } from './default'

export const GEMINI_MARKERS = {
    Prefix: ps`<|prefix|>`,
    Suffix: ps`<|suffix|>`,
    Response: ps`<|fim|>`,
}

interface GetIntroMessagesParams {
    fileName: PromptString
    /**
     * code before the cursor, without the code extracted for the infillBlock
     */
    infillPrefix: PromptString
    /**
     * code after the cursor
     */
    infillSuffix: PromptString
    /**
     * Infill block represents the code we want the model to complete
     */
    infillBlock: PromptString
}

export class Claude extends DefaultModel {
    public stopSequences = [anthropic.HUMAN_PROMPT, CLOSING_CODE_TAG.toString()]

    getOllamaPrompt(promptContext: GetOllamaPromptParams): PromptString {
        throw new Error('Claude is not supported by the Ollama provider yet!')
    }

    private emptyPromptLength(options: GetIntroMessagesParams): number {
        const messages = this.getIntroMessages(options)
        const promptNoSnippets = messagesToText(messages)
        return promptNoSnippets.length - 10 // extra 10 chars of buffer cuz who knows
    }

    private getIntroMessages(params: GetIntroMessagesParams): Message[] {
        const { fileName, infillPrefix, infillSuffix, infillBlock } = params

        return [
            {
                speaker: 'human',
                text: ps`You are a code completion AI designed to take the surrounding code and shared context into account in order to predict and suggest high-quality code to complete the code enclosed in ${OPENING_CODE_TAG} tags. You only respond with code that works and fits seamlessly with surrounding code if any or use best practice and nothing else.`,
            },
            {
                speaker: 'assistant',
                text: ps`I am a code completion AI with exceptional context-awareness designed to auto-complete nested code blocks with high-quality code that seamlessly integrates with surrounding code.`,
            },
            {
                speaker: 'human',
                text: ps`Below is the code from file path ${fileName}. Review the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations. Here is the code: \n\`\`\`\n${infillPrefix}${OPENING_CODE_TAG}${CLOSING_CODE_TAG}${infillSuffix}\n\`\`\``,
            },
            {
                speaker: 'assistant',
                text: ps`${OPENING_CODE_TAG}${infillBlock}`,
            },
        ]
    }

    public getMessages(params: GetPromptParams): Message[] {
        const { snippets, docContext, document, promptChars } = params
        const { prefix, suffix } = PromptString.fromAutocompleteDocumentContext(docContext, document.uri)

        const prefixLines = prefix.split('\n')
        if (prefixLines.length === 0) {
            throw new Error('no prefix lines')
        }

        const { head, tail } = getHeadAndTail(prefix)

        // Infill block represents the code we want the model to complete
        const infillBlock = tail.trimmed.toString().endsWith('{\n')
            ? tail.trimmed.trimEnd()
            : tail.trimmed

        const contextSnippetMessages: Message[] = []

        const introParams = {
            fileName: PromptString.fromDisplayPath(document.uri),
            infillPrefix: head.raw ?? ps``,
            infillSuffix: suffix,
            infillBlock,
        }

        let remainingChars = promptChars - this.emptyPromptLength(introParams)
        const introMessages = this.getIntroMessages(introParams)

        for (const snippet of snippets) {
            const snippetMessages: Message[] = [
                {
                    speaker: 'human',
                    text:
                        'symbol' in snippet
                            ? this.symbolSnippetToPromptString(snippet)
                            : this.fileSnippetToPromptString(snippet),
                },
                {
                    speaker: 'assistant',
                    text: ps`I will refer to this code to complete your next request.`,
                },
            ]

            const numSnippetChars = messagesToText(snippetMessages).length + 1
            if (numSnippetChars > remainingChars) {
                break
            }
            contextSnippetMessages.push(...snippetMessages)
            remainingChars -= numSnippetChars
        }

        return [...contextSnippetMessages, ...introMessages]
    }

    protected fileSnippetToPromptString(snippet: AutocompleteContextSnippet): PromptString {
        const { uri } = snippet
        const { content } = PromptString.fromAutocompleteContextSnippet(snippet)

        const uriPromptString = PromptString.fromDisplayPath(uri)
        return ps`Codebase context from file path '${uriPromptString}': ${OPENING_CODE_TAG}${content}${CLOSING_CODE_TAG}`
    }

    protected symbolSnippetToPromptString(snippet: AutocompleteSymbolContextSnippet): PromptString {
        const { content, symbol } = PromptString.fromAutocompleteContextSnippet(snippet)

        return ps`Additional documentation for \`${symbol!}\`: ${OPENING_CODE_TAG}${content}${CLOSING_CODE_TAG}`
    }

    public postProcess(content: string, docContext: DocumentContext): string {
        let completion = extractFromCodeBlock(content)

        const trimmedPrefixContainNewline = docContext.prefix
            .slice(docContext.prefix.trimEnd().length)
            .includes('\n')
        if (trimmedPrefixContainNewline) {
            // The prefix already contains a `\n` that Claude was not aware of, so we remove any
            // leading `\n` followed by whitespace that Claude might add.
            completion = completion.replace(/^\s*\n\s*/, '')
        } else {
            completion = trimLeadingWhitespaceUntilNewline(completion)
        }

        // Remove bad symbols from the start of the completion string.
        completion = fixBadCompletionStart(completion)

        return completion
    }
}
