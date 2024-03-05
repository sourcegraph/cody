import type * as vscode from 'vscode'

import {
    type CodyCommand,
    type ContextItem,
    type ContextMessage,
    MAX_CURRENT_FILE_TOKENS,
    createContextMessageByFile,
    getContextMessageWithResponse,
    populateCodeContextTemplate,
    populateCodeGenerationContextTemplate,
    populateCurrentEditorDiagnosticsTemplate,
    truncateText,
    truncateTextStart,
} from '@sourcegraph/cody-shared'

import type { VSCodeEditor } from '../../editor/vscode-editor'
import type { EditIntent } from '../types'

import { PROMPT_TOPICS } from './constants'
import { extractContextItemsFromContextMessages } from './utils'

interface GetContextFromIntentOptions {
    intent: EditIntent
    selectedText: string
    precedingText: string
    followingText: string
    uri: vscode.Uri
    selectionRange: vscode.Range
    editor: VSCodeEditor
}

const getContextFromIntent = async ({
    intent,
    precedingText,
    followingText,
    uri,
    selectionRange,
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
        case 'test':
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
                    ...getContextMessageWithResponse(
                        populateCodeContextTemplate(truncatedPrecedingText, uri, undefined, 'edit'),
                        {
                            type: 'file',
                            uri,
                        }
                    )
                )
            }
            if (truncatedFollowingText.trim().length > 0) {
                contextMessages.push(
                    ...getContextMessageWithResponse(
                        populateCodeContextTemplate(truncatedFollowingText, uri, undefined, 'edit'),
                        {
                            type: 'file',
                            uri,
                        }
                    )
                )
            }
            return contextMessages
        }
        /**
         * Broad set of possible instructions.
         * Fetch context from the users' selection, use any errors/warnings in said selection, and use context from current file.
         * Non-code files are not considered as including Markdown syntax seems to lead to more hallucinations and poorer output quality.
         */
        case 'edit': {
            const range = selectionRange
            const diagnostics = range ? editor.getActiveTextEditorDiagnosticsForRange(range) || [] : []
            const errorsAndWarnings = diagnostics.filter(
                ({ type }) => type === 'error' || type === 'warning'
            )
            return [
                ...errorsAndWarnings.flatMap(diagnostic =>
                    getContextMessageWithResponse(
                        populateCurrentEditorDiagnosticsTemplate(diagnostic, uri),
                        {
                            type: 'file',
                            uri,
                        }
                    )
                ),
                ...[truncatedPrecedingText, truncatedFollowingText]
                    .filter(text => text.trim().length > 0)
                    .flatMap(text =>
                        getContextMessageWithResponse(
                            populateCodeContextTemplate(text, uri, undefined, 'edit'),
                            {
                                type: 'file',
                                uri,
                            }
                        )
                    ),
            ]
        }
    }
}

const isAgentTesting = process.env.CODY_SHIM_TESTING === 'true'

interface GetContextOptions extends GetContextFromIntentOptions {
    userContextFiles: ContextItem[]
    contextMessages?: ContextMessage[]
    editor: VSCodeEditor
    command?: CodyCommand
}

export const getContext = async ({
    userContextFiles,
    editor,
    contextMessages,
    ...options
}: GetContextOptions): Promise<ContextItem[]> => {
    if (contextMessages && contextMessages.length > 0) {
        // TODO: We currently use `contextMessages` as a way to programmatically provide specific context
        // for test files and attach this context to the `FixupTask`.
        // We should move this logic to `getContextFromIntent`
        return extractContextItemsFromContextMessages(contextMessages)
    }

    const derivedContextMessages = await getContextFromIntent({ editor, ...options })

    const userProvidedContextMessages: ContextMessage[] = []

    if (isAgentTesting) {
        // Need deterministic ordering of context files for the tests to pass
        // consistently across different file systems.
        userContextFiles.sort((a, b) => a.uri.path.localeCompare(b.uri.path))
    }
    for (const file of userContextFiles) {
        if (file.uri) {
            const content = await editor.getTextEditorContentForFile(file.uri, file.range)
            if (content) {
                const message = createContextMessageByFile(file, content)
                userProvidedContextMessages.push(...message)
            }
        }
    }

    return extractContextItemsFromContextMessages([
        ...derivedContextMessages,
        ...userProvidedContextMessages,
    ])
}
