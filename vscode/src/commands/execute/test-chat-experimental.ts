import {
    type ChatMessage,
    PromptString,
    editorStateFromPromptString,
    ps,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { selectedCodePromptWithExtraFiles } from '.'
import { isUriIgnoredByContextFilterWithNotification } from '../../cody-ignore/context-filter'
import { getEditor } from '../../editor/active-editor'
import { getContextFileFromCursor } from '../context/selection'

export async function experimentalUnitTestMessageSubmission(): Promise<ChatMessage | undefined> {
    try {
        return await chatMessageTemplate()
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to generate test prompt: ${error}`)
        return
    }
}

async function chatMessageTemplate(): Promise<ChatMessage | undefined> {
    const editor = getEditor()?.active
    const document = editor?.document
    if (!document) {
        throw new Error('No active document')
    }
    if (await isUriIgnoredByContextFilterWithNotification(document.uri, 'test')) {
        return
    }
    const contextFile = await getContextFileFromCursor()
    if (contextFile === null) {
        throw new Error('Selection content is empty. Please select some code to generate tests for.')
    }

    const { content } = PromptString.fromContextItem(contextFile)
    if (!content) {
        throw new Error('active editor content is empty when used as context item')
    }
    const prompt = ps`Your task is to generate a suit of multiple unit tests for the functions defined inside the ${selectedCodePromptWithExtraFiles(
        contextFile,
        []
    )} file. Use the {{mention the testing framework}} framework to generate the unit tests. Follow the example tests from the {{mention an example test file}} test file. Include unit tests for the following cases: {{list test cases}}. Ensure that the unit tests cover all the edge cases and validate the expected functionality of the functions`

    return {
        speaker: 'human',
        text: prompt,
        editorState: editorStateFromPromptString(prompt, { parseTemplates: true }),
    }
}
