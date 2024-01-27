import { logError, type ContextFile } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getContextFileFromCursor } from '../context/selection'
import { DefaultEditCommands } from '@sourcegraph/cody-shared/src/commands/types'
import { defaultCommands } from '.'
import type { EditCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'
import { getContextFilesForUnitTestCommand } from '../context/unit-test-command'

/**
 * NOTE (bee) this will replace the existing test command once it's ready
 *
 * The experimental command that generates a new test file for the selected code.
 * When calls, the command will be executed as an inline-edit command.
 *
 * Context: Test files, current selection, and current file
 */
export async function executeNewTestCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
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

        const files = await getContextFilesForUnitTestCommand(document.uri)
        contextFiles.push(...files)
    } catch (error) {
        logError('executeNewTestCommand', 'failed to fetch context', { verbose: error })
    }

    return {
        type: 'edit',
        task: await executeEdit(
            {
                instruction: prompt,
                document,
                intent: 'new',
                mode: 'file',
                userContextFiles: contextFiles,
            } satisfies ExecuteEditArguments,
            DefaultEditCommands.Doc
        ),
    }
}
