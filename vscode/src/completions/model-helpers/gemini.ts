import {
    type AutocompleteContextSnippet,
    type AutocompleteSymbolContextSnippet,
    type DocumentContext,
    type Message,
    PromptString,
    ps,
} from '@sourcegraph/cody-shared'

import { fixBadCompletionStart } from '../text-processing'
import {
    DefaultModel,
    type FormatIntroSnippetsParams,
    type FormatPromptParams,
    type GetOllamaPromptParams,
    type GetPromptParams,
} from './default'

const GEMINI_MARKERS = {
    Prefix: ps`<|prefix|>`,
    Suffix: ps`<|suffix|>`,
    Response: ps`<|fim|>`,
}

export class Gemini extends DefaultModel {
    public stopSequences = [`${GEMINI_MARKERS.Response}`]

    getOllamaPrompt(promptContext: GetOllamaPromptParams): PromptString {
        throw new Error('Gemini is not supported by the Ollama provider yet!')
    }

    public getMessages(params: GetPromptParams): Message[] {
        return [
            { speaker: 'human', text: this.getPrompt(params) },
            { speaker: 'assistant', text: ps`${GEMINI_MARKERS.Response}` },
        ]
    }

    protected fileSnippetToPromptString(snippet: AutocompleteContextSnippet): PromptString {
        const { content, symbol } = PromptString.fromAutocompleteContextSnippet(snippet)

        return this.formatContextSnippet(
            ps`file`,
            symbol ? symbol : PromptString.fromDisplayPath(snippet.uri),
            content
        )
    }

    protected symbolSnippetToPromptString(snippet: AutocompleteSymbolContextSnippet): PromptString {
        const { content, symbol } = PromptString.fromAutocompleteContextSnippet(snippet)

        return this.formatContextSnippet(
            ps`symbol`,
            symbol ? symbol : PromptString.fromDisplayPath(snippet.uri),
            content
        )
    }

    private formatContextSnippet(type: PromptString, name: PromptString, content: PromptString) {
        return ps`\n-TYPE: ${type}\n-NAME: ${name}\n-CONTENT: ${content.trimEnd()}\n---\n`
    }

    protected formatIntroSnippets({ intro }: FormatIntroSnippetsParams): PromptString {
        return PromptString.join(intro, ps``)
    }

    protected formatPrompt(params: FormatPromptParams): PromptString {
        const { intro, prefix, suffix, fileName } = params

        // See official docs on prompting for Gemini models:
        // https://ai.google.dev/gemini-api/docs/prompting-intro
        const fimPrompt = ps`${GEMINI_MARKERS.Prefix}${prefix}${GEMINI_MARKERS.Response}${suffix}${GEMINI_MARKERS.Suffix}`

        const humanText = ps`You are a code completion AI, designed to autofill code enclosed in special markers based on its surrounding context.
${intro}

Code from ${fileName} file:
${fimPrompt}

Your mission is to generate completed code that I can replace the ${GEMINI_MARKERS.Response} markers with, ensuring a seamless and syntactically correct result.

Do not repeat code from before and after ${GEMINI_MARKERS.Response} in your output.
Maintain consistency with the indentation, spacing, and coding style used in the code.
Leave the output markers empty if no code is required to bridge the gap.
Your response should contains only the code required to connect the gap, and the code must be enclosed between ${GEMINI_MARKERS.Response} WITHOUT backticks`

        return humanText
    }

    public postProcess(content: string, docContext: DocumentContext): string {
        let completion = content

        // Because the response should be enclosed with RESPONSE_CODE for consistency.
        completion = completion
            .replaceAll(`${GEMINI_MARKERS.Response}`, '')
            .replaceAll(`${GEMINI_MARKERS.Suffix}`, '')

        // Remove bad symbols from the start of the completion string.
        completion = fixBadCompletionStart(completion)

        return completion
    }
}
