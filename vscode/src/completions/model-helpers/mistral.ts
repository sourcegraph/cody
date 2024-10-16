import { type PromptString, ps } from '@sourcegraph/cody-shared'

import { CLOSING_CODE_TAG, OPENING_CODE_TAG, getHeadAndTail } from '../text-processing'
import { DefaultModel, type FormatPromptParams, type GetOllamaPromptParams } from './default'

export class Mistral extends DefaultModel {
    getOllamaPrompt(promptContext: GetOllamaPromptParams): PromptString {
        throw new Error('Mistral is not supported by the Ollama provider yet!')
    }

    formatPrompt(params: FormatPromptParams): PromptString {
        const { intro, prefix, suffix, fileName } = params

        const { head, tail } = getHeadAndTail(prefix)
        const infillBlock = tail.trimmed.toString().endsWith('{\n')
            ? tail.trimmed.trimEnd()
            : tail.trimmed

        const infillPrefix = head.raw || ''

        // https://docs.mistral.ai/guides/tokenization/#control-tokens
        return ps`<s>[INST] Below is the code from file path ${fileName}. Review the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations. Here is the code:
\`\`\`
${intro}${infillPrefix}${OPENING_CODE_TAG}${CLOSING_CODE_TAG}${suffix}
\`\`\`[/INST]
 ${OPENING_CODE_TAG}${infillBlock}`
    }
}
