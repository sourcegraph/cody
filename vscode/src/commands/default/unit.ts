import { logError, type ContextFile } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getContextFileFromCursor } from '../context/selection'
import { getContextFilesForTests } from '../context/test-files'
import { DefaultEditCommands } from '@sourcegraph/cody-shared/src/commands/types'
import { defaultCommands } from '.'
/**
 * NOTE (bee) this will replace the existing test command once it's ready
 *
 * The experimental command that generates a new test file for the selected code.
 * When calls, the command will be executed as an inline-edit command.
 *
 * Context: Test files, current selection, and current file
 */
export async function executeNewTestCommand(): Promise<undefined> {
    const prompt = defaultCommands.unit.prompt

    const editor = getEditor()?.active
    const document = editor?.document
    if (!document) {
        return
    }

    const contextFiles: ContextFile[] = []

    try {
        const cursorContext = await getContextFileFromCursor()
        contextFiles.push(...cursorContext)

        const files = await getContextFilesForTests(document.uri)
        contextFiles.push(...files)
    } catch (error) {
        logError('executeNewTestCommand', 'failed to fetch context', { verbose: error })
    }

    await executeEdit(
        {
            instruction: prompt,
            document,
            intent: 'new',
            mode: 'file',
            userContextFiles: contextFiles,
        } satisfies ExecuteEditArguments,
        DefaultEditCommands.Doc
    )
}
