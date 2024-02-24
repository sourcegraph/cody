import { PROMPT_TOPICS } from '../constants'
import type { EditLLMInteraction } from '../type'
import { type PromptVariant, buildPrompt } from './generic'

const RESPONSE_PREFIX = `<${PROMPT_TOPICS.OUTPUT}>\n`
const SHARED_PARAMETERS = {
    responseTopic: PROMPT_TOPICS.OUTPUT,
    stopSequences: [`</${PROMPT_TOPICS.OUTPUT}>`],
    assistantText: RESPONSE_PREFIX,
    assistantPrefix: RESPONSE_PREFIX,
}

const buildMistralTemplate = (promptVariant: PromptVariant) => {
    return `<s> [INST]${promptVariant.system}[/INST]` + promptVariant.instruction
}

export const mistral: EditLLMInteraction = {
    getEdit(options) {
        return {
            ...SHARED_PARAMETERS,
            prompt: buildPrompt('edit', options, buildMistralTemplate),
        }
    },
    getDoc(options) {
        return {
            ...SHARED_PARAMETERS,
            prompt: buildPrompt('doc', options),
        }
    },
    getFix(options) {
        return {
            ...SHARED_PARAMETERS,
            prompt: buildPrompt('fix', options),
        }
    },
    getAdd(options) {
        let assistantPreamble = ''
        if (options.precedingText) {
            assistantPreamble = `<${PROMPT_TOPICS.PRECEDING}>${options.precedingText}</${PROMPT_TOPICS.PRECEDING}>`
        }
        return {
            ...SHARED_PARAMETERS,
            assistantText: `${assistantPreamble}${RESPONSE_PREFIX}`,
            prompt: buildPrompt('add', options),
        }
    },
    getTest(options) {
        return {
            ...SHARED_PARAMETERS,
            prompt: buildPrompt('test', options),
        }
    },
}
