import { PROMPT_TOPICS } from '../constants'
import type { EditLLMInteraction } from '../type'
import { buildGenericPrompt } from './generic'

const RESPONSE_PREFIX = `<${PROMPT_TOPICS.OUTPUT}>`
const SHARED_PARAMETERS = {
    responseTopic: PROMPT_TOPICS.OUTPUT,
    stopSequences: [`</${PROMPT_TOPICS.OUTPUT}>`],
    assistantText: RESPONSE_PREFIX,
    assistantPrefix: RESPONSE_PREFIX,
}

export const claude: EditLLMInteraction = {
    getEdit(options) {
        return {
            ...SHARED_PARAMETERS,
            prompt: buildGenericPrompt('edit', options),
        }
    },
    getDoc(options) {
        const docStopSequences = [...SHARED_PARAMETERS.stopSequences]
        const firstLine = options.selectedText.split('\n')[0]
        if (firstLine.trim().length > 0) {
            docStopSequences.push(firstLine)
        }

        return {
            ...SHARED_PARAMETERS,
            stopSequences: docStopSequences,
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
        let assistantPreamble = ''
        if (options.precedingText) {
            assistantPreamble = `<${PROMPT_TOPICS.PRECEDING}>${options.precedingText}</${PROMPT_TOPICS.PRECEDING}>`
        }
        return {
            ...SHARED_PARAMETERS,
            assistantText: `${assistantPreamble}${RESPONSE_PREFIX}`,
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
