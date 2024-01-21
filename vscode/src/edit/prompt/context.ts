import type * as vscode from 'vscode'

import {
    createContextMessageByFile,
    getContextMessageWithResponse,
    MAX_CURRENT_FILE_TOKENS,
    populateCodeContextTemplate,
    populateCodeGenerationContextTemplate,
    populateCurrentEditorDiagnosticsTemplate,
    truncateText,
    truncateTextStart,
    type CodebaseContext,
    type CodyCommand,
    type ContextFile,
    type ContextMessage,
} from '@sourcegraph/cody-shared'

import { type VSCodeEditor } from '../../editor/vscode-editor'
import { type EditIntent } from '../types'

import { PROMPT_TOPICS } from './constants'

interface GetContextFromIntentOptions {
    intent: EditIntent
    selectedText: string
    precedingText: string
    followingText: string
    uri: vscode.Uri
    selectionRange: vscode.Range
    editor: VSCodeEditor
    context: CodebaseContext
}

const getContextFromIntent = async ({
    intent,
    selectedText,
    precedingText,
    followingText,
    uri,
    selectionRange,
    context,
    editor,
}: GetContextFromIntentOptions): Promise<ContextMessage[]> => {
    const truncatedPrecedingText = truncateTextStart(precedingText, MAX_CURRENT_FILE_TOKENS)
    const truncatedFollowingText = truncateText(followingText, MAX_CURRENT_FILE_TOKENS)

    // Disable no case declarations because we get better type checking with a switch case
    switch (intent) {
        /**
         * Very broad set of possible instructions.
         * Fetch context from the users' instructions and use context from current file.
         * Include the following code from the current file.
         * The preceding code is already included as part of the response to better guide the output.
         */
        case 'new':
        case 'add': {
            return [
                ...getContextMessageWithResponse(
                    populateCodeGenerationContextTemplate(
                        `<${PROMPT_TOPICS.PRECEDING}>${truncatedPrecedingText}</${PROMPT_TOPICS.PRECEDING}>`,
                        `<${PROMPT_TOPICS.FOLLOWING}>${truncatedFollowingText}</${PROMPT_TOPICS.FOLLOWING}>`,
                        uri,
                        PROMPT_TOPICS.OUTPUT
                    ),
                    { type: 'file', uri }
                ),
            ]
        }
        /**
         * Specific case where a user is explciitly trying to "fix" a problem in their code.
         * No additional context is required. We already have the errors directly via the instruction, and we know their selected code.
         */
        case 'fix':
        /**
         * Very narrow set of possible instructions.
         * Fetching context is unlikely to be very helpful or optimal.
         */
        case 'doc': {
            const contextMessages = []
            if (truncatedPrecedingText.trim().length > 0) {
                contextMessages.push(
                    ...getContextMessageWithResponse(populateCodeContextTemplate(truncatedPrecedingText, uri), {
                        type: 'file',
                        uri,
                    })
                )
            }
            if (truncatedFollowingText.trim().length > 0) {
                contextMessages.push(
                    ...getContextMessageWithResponse(populateCodeContextTemplate(truncatedFollowingText, uri), {
                        type: 'file',
                        uri,
                    })
                )
            }
            return contextMessages
        }
        /**
         * Broad set of possible instructions.
         * Fetch context from the users' selection, use any errors/warnings in said selection, and use context from current file.
         * Non-code files are not considered as including Markdown syntax seems to lead to more hallucinations and poorer output quality.
         */
        case 'edit':
            const range = selectionRange
            const diagnostics = range ? editor.getActiveTextEditorDiagnosticsForRange(range) || [] : []
            const errorsAndWarnings = diagnostics.filter(({ type }) => type === 'error' || type === 'warning')
            const selectionContext = await getContextMessagesFromSelection(
                selectedText,
                truncatedPrecedingText,
                truncatedFollowingText,
                { fileUri: uri },
                context
            )
            return [
                ...selectionContext,
                ...errorsAndWarnings.flatMap(diagnostic =>
                    getContextMessageWithResponse(populateCurrentEditorDiagnosticsTemplate(diagnostic, uri), {
                        type: 'file',
                        uri,
                    })
                ),
            ]
    }
    /* eslint-enable no-case-declarations */
}

interface GetContextOptions extends GetContextFromIntentOptions {
    userContextFiles: ContextFile[]
    contextMessages?: ContextMessage[]
    editor: VSCodeEditor
    command?: CodyCommand
}

export const getContext = async ({
    userContextFiles,
    editor,
    contextMessages,
    ...options
}: GetContextOptions): Promise<ContextMessage[]> => {
    // return contextMessages is already provided by the caller
    if (contextMessages) {
        return contextMessages
    }

    const derivedContextMessages = await getContextFromIntent({ editor, ...options })

    const userProvidedContextMessages: ContextMessage[] = []
    for (const file of userContextFiles) {
        if (file.uri) {
            const content = await editor.getTextEditorContentForFile(file.uri, file.range)
            if (content) {
                const message = createContextMessageByFile(file, content)
                userProvidedContextMessages.push(...message)
            }
        }
    }

    return [...derivedContextMessages, ...userProvidedContextMessages]
}

async function getContextMessagesFromSelection(
    selectedText: string,
    precedingText: string,
    followingText: string,
    { fileUri, repoName, revision }: { fileUri: vscode.Uri; repoName?: string; revision?: string },
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
