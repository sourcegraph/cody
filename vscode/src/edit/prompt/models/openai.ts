import { ps } from '@sourcegraph/cody-shared'
import { PROMPT_TOPICS } from '../constants'
import type { EditLLMInteraction } from '../type'
import { buildGenericPrompt, getGenericPrefixes } from './generic'

const RESPONSE_PREFIX = ps`<${PROMPT_TOPICS.OUTPUT}>\n`
const SHARED_PARAMETERS = {
    responseTopic: PROMPT_TOPICS.OUTPUT,
    stopSequences: [`</${PROMPT_TOPICS.OUTPUT}>`],
}

const MODEL_PREFIX = {
    assistantText: RESPONSE_PREFIX,
    assistantPrefix: RESPONSE_PREFIX,
} as const

export const openai: EditLLMInteraction = {
    getEdit(options) {
        return {
            ...SHARED_PARAMETERS,
            ...getGenericPrefixes(MODEL_PREFIX, options.isReasoningModel),
            prompt: buildGenericPrompt('edit', options),
        }
    },
    getDoc(options) {
        return {
            ...SHARED_PARAMETERS,
            ...getGenericPrefixes(MODEL_PREFIX, options.isReasoningModel),
            prompt: buildGenericPrompt('doc', options),
        }
    },
    getFix(options) {
        return {
            ...SHARED_PARAMETERS,
            ...getGenericPrefixes(MODEL_PREFIX, options.isReasoningModel),
            prompt: buildGenericPrompt('fix', options),
        }
    },
    getAdd(options) {
        let assistantPreamble = ps``
        if (options.precedingText.length > 0) {
            assistantPreamble = ps`<${PROMPT_TOPICS.PRECEDING}>${options.precedingText}</${PROMPT_TOPICS.PRECEDING}>`
        }
        return {
            ...SHARED_PARAMETERS,
            ...getGenericPrefixes(
                { ...MODEL_PREFIX, assistantText: ps`${assistantPreamble}${RESPONSE_PREFIX}` },
                options.isReasoningModel
            ),
            prompt: buildGenericPrompt('add', options),
        }
    },
    getTest(options) {
        return {
            ...SHARED_PARAMETERS,
            ...getGenericPrefixes(MODEL_PREFIX, options.isReasoningModel),
            prompt: buildGenericPrompt('test', options),
        }
    },
}
