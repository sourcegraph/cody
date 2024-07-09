import {
    type ChatMessage,
    PromptString,
    STATE_VERSION_CURRENT,
    lexicalEditorStateFromPromptString,
    ps,
} from '@sourcegraph/cody-shared'
import { selectedCodePromptWithExtraFiles } from '.'
import { isUriIgnoredByContextFilterWithNotification } from '../../cody-ignore/context-filter'
import { getEditor } from '../../editor/active-editor'
import { getContextFileFromCursor } from '../context/selection'

export async function experimentalUnitTestMessageSubmission(): Promise<ChatMessage | undefined> {
    const editor = getEditor()?.active
    const document = editor?.document
    if (!document || (await isUriIgnoredByContextFilterWithNotification(document.uri, 'test'))) {
        return
    }
    const contextFile = await getContextFileFromCursor()
    if (contextFile === null) {
        throw new Error('Selection content is empty. Please select some code to generate tests for.')
    }

    const { content } = PromptString.fromContextItem(contextFile)
    if (!content) {
        return
    }
    const prompt = ps`Your task is to generate a suit of multiple unit tests for the functions defined inside the ${selectedCodePromptWithExtraFiles(
        contextFile,
        []
    )} file. Use the {{mention the testing framework}} framework to generate the unit tests. Follow the example tests from the {{mention an example test file}} test file. Include unit tests for the following cases: {{list test cases}}. Ensure that the unit tests cover all the edge cases and validate the expected functionality of the functions`

    return {
        speaker: 'human',
        text: prompt,
        editorState: {
            lexicalEditorState: lexicalEditorStateFromPromptString(prompt),
            v: STATE_VERSION_CURRENT,
            minReaderV: STATE_VERSION_CURRENT,
        },
    }
}
