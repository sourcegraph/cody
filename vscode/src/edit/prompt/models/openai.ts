import { PROMPT_TOPICS } from '../constants'
import type { EditLLMInteraction } from '../type'
import { buildGenericPrompt } from './generic'

// const RESPONSE_PREFIX = `<${PROMPT_TOPICS.OUTPUT}>\n`
const SHARED_PARAMETERS = {
    responseTopic: PROMPT_TOPICS.OUTPUT,
    stopSequences: [`</${PROMPT_TOPICS.OUTPUT}>`],
    // TODO: Check that we can't use the assistant text/prefix for OpenAI models
    // assistantText: RESPONSE_PREFIX,
    // assistantPrefix: RESPONSE_PREFIX,
}

export const openai: EditLLMInteraction = {
    getEdit(options) {
        return {
            ...SHARED_PARAMETERS,
            prompt: buildGenericPrompt('edit', options),
        }
    },
    getDoc(options) {
        return {
            ...SHARED_PARAMETERS,
            prompt: buildGenericPrompt('doc', options),
        }
    },
    getFix(options) {
        return {
            ...SHARED_PARAMETERS,
            prompt: buildGenericPrompt('fix', options),
        }
    },
    getAdd(options) {
        // TODO: Implement the same preamble logic, without putting words into GPT's mouth
        // let assistantPreamble = ''
        // if (options.precedingText) {
        //     assistantPreamble = `<${PROMPT_TOPICS.PRECEDING}>${options.precedingText}</${PROMPT_TOPICS.PRECEDING}>`
        // }
        return {
            ...SHARED_PARAMETERS,
            // assistantText: `${assistantPreamble}${RESPONSE_PREFIX}`,
            prompt: buildGenericPrompt('add', options),
        }
    },
    getTest(options) {
        return {
            ...SHARED_PARAMETERS,
            prompt: buildGenericPrompt('test', options),
        }
    },
}
