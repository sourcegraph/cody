import type * as vscode from 'vscode'
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

const getDocumentCommentSyntax = (
    document: vscode.TextDocument
): { commentPrefix: string; commentSuffix: string } => {
    // TODO: Should we improve this so it handles symbols vs functions etc?
    switch (document.languageId) {
        case 'typescript':
        case 'typescriptreact':
        case 'javascript':
        case 'javascriptreact':
            return {
                commentPrefix: '/**\n',
                commentSuffix: '*/',
            }
        case 'python':
            return {
                commentPrefix: '"""',
                commentSuffix: '"""',
            }
        default:
            return {
                commentPrefix: '',
                commentSuffix: '',
            }
    }
}

export const claude: EditLLMInteraction = {
    getEdit(options) {
        return {
            ...SHARED_PARAMETERS,
            prompt: buildGenericPrompt('edit', options),
        }
    },
    getDoc(options) {
        const firstLine = options.selectedText.split('\n')[0]
        const { commentPrefix, commentSuffix } = getDocumentCommentSyntax(options.document)
        const stopSequences = [...SHARED_PARAMETERS.stopSequences, firstLine]
        if (commentSuffix) {
            stopSequences.push(commentSuffix)
        }

        return {
            ...SHARED_PARAMETERS,
            stopSequences,
            assistantPrefix: commentPrefix + RESPONSE_PREFIX,
            assistantSuffix: commentSuffix ? commentSuffix + '\n' : '',
            assistantText: RESPONSE_PREFIX + commentPrefix,
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
