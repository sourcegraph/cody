import { logDebug, type ContextFile } from '@sourcegraph/cody-shared'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getEditor } from '../../editor/active-editor'
import { getContextFileFromCursor } from '../context/selection'
import { DefaultEditCommands } from '@sourcegraph/cody-shared/src/commands/types'
import { defaultCommands } from '.'
import type { EditCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'

/**
 * The command that generates a new docstring for the selected code.
 * When calls, the command will be executed as an inline-edit command.
 *
 * Context: Current selection
 */
export async function executeDocCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
    logDebug('executeDocCommand', 'executing', { args })
    const prompt = defaultCommands.doc.prompt

    const contextFiles: ContextFile[] = []
    const currentSelection = await getContextFileFromCursor()

    contextFiles.push(...currentSelection)

    const editor = getEditor()?.active
    const document = editor?.document

    if (!document) {
        return undefined
    }

    const task = await executeEdit(
        {
            instruction: prompt,
            document,
            intent: 'doc',
            mode: 'insert',
            userContextFiles: contextFiles,
        } satisfies ExecuteEditArguments,
        DefaultEditCommands.Doc
    )

    if (!task?.id) {
        return undefined
    }

    return {
        type: 'edit',
        task,
    }
}
