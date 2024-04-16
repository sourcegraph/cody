import { ps } from '@sourcegraph/cody-shared'
import { PROMPT_TOPICS } from '../constants'
import type { EditLLMInteraction } from '../type'
import { buildGenericPrompt } from './generic'

const RESPONSE_PREFIX = ps`<${PROMPT_TOPICS.OUTPUT}>`
const TEST_FILE_PREFIX = ps`<${PROMPT_TOPICS.FILENAME}>`
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
        const firstLine = options.selectedText.toString().split('\n')[0]
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
        let assistantPreamble = ps``
        if (options.precedingText.length > 0) {
            assistantPreamble = ps`<${PROMPT_TOPICS.PRECEDING}>${options.precedingText}</${PROMPT_TOPICS.PRECEDING}>`
        }
        return {
            ...SHARED_PARAMETERS,
            assistantText: ps`${assistantPreamble}${RESPONSE_PREFIX}`,
            prompt: buildGenericPrompt('add', options),
        }
    },
    getTest(options) {
        return {
            ...SHARED_PARAMETERS,
            assistantText: ps`${RESPONSE_PREFIX}${TEST_FILE_PREFIX}`,
            assistantPrefix: ps`${RESPONSE_PREFIX}${TEST_FILE_PREFIX}`,
            prompt: buildGenericPrompt('test', options),
        }
    },
}
