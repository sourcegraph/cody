import { type URI } from 'vscode-uri'

import { type CodebaseContext } from '../../codebase-context'
import { getContextMessageWithResponse, type ContextMessage } from '../../codebase-context/messages'
import { NUM_CODE_RESULTS, NUM_TEXT_RESULTS } from '../../prompt/constants'
import { populateCodeContextTemplate } from '../../prompt/templates'
import { Interaction } from '../transcript/interaction'
import { type ChatEventSource } from '../transcript/messages'

export const MARKDOWN_FORMAT_PROMPT = 'Enclose code snippets with three backticks like so: ```.'

export async function getContextMessagesFromSelection(
    selectedText: string,
    precedingText: string,
    followingText: string,
    { fileUri, repoName, revision }: { fileUri: URI; repoName?: string; revision?: string },
    codebaseContext: CodebaseContext
): Promise<ContextMessage[]> {
    const selectedTextContext = await codebaseContext.getContextMessages(selectedText, {
        numCodeResults: 4,
        numTextResults: 0,
    })

    return selectedTextContext.concat(
        [precedingText, followingText]
            .filter(text => text.trim().length > 0)
            .flatMap(text =>
                getContextMessageWithResponse(populateCodeContextTemplate(text, fileUri, repoName), {
                    type: 'file',
                    uri: fileUri,
                    repoName,
                    revision,
                })
            )
    )
}

export const numResults = {
    numCodeResults: NUM_CODE_RESULTS,
    numTextResults: NUM_TEXT_RESULTS,
}

export function isSingleWord(str: string): boolean {
    return str.trim().split(/\s+/).length === 1
}

/**
 * Creates a new Interaction object with the given parameters.
 */
export async function newInteraction(args: {
    text?: string
    displayText?: string
    contextMessages?: Promise<ContextMessage[]>
    assistantText?: string
    assistantDisplayText?: string
    assistantPrefix?: string
    source?: ChatEventSource
    requestID?: string
}): Promise<Interaction> {
    const {
        text,
        displayText,
        contextMessages,
        assistantText,
        assistantDisplayText,
        assistantPrefix,
        source,
        requestID,
    } = args
    const metadata = { source, requestID }
    return Promise.resolve(
        new Interaction(
            { speaker: 'human', text, displayText, metadata },
            {
                speaker: 'assistant',
                text: assistantText,
                displayText: assistantDisplayText,
                prefix: assistantPrefix,
                metadata,
            },
            Promise.resolve(contextMessages || []),
            []
        )
    )
}
