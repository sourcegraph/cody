import type { ContextFile } from '@sourcegraph/cody-shared'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getEditor } from '../../editor/active-editor'
import { getContextFileFromCursor } from '../context/selection'
import { DefaultEditCommands } from '@sourcegraph/cody-shared/src/commands/types'
import { defaultCommands } from '.'

/**
 * The command that generates a new docstring for the selected code.
 * When calls, the command will be executed as an inline-edit command.
 *
 * Context: Current selection
 */
export async function executeDocCommand(): Promise<undefined> {
    const prompt = defaultCommands.doc.prompt

    const contextFiles: ContextFile[] = []
    const currentSelection = await getContextFileFromCursor()
    if (currentSelection) {
        contextFiles.push(currentSelection)
    }

    const editor = getEditor()?.active
    const document = editor?.document

    if (!document) {
        return undefined
    }

    await executeEdit(
        {
            instruction: prompt,
            document,
            intent: 'doc',
            mode: 'insert',
            userContextFiles: contextFiles,
        } satisfies ExecuteEditArguments,
        DefaultEditCommands.Doc
    )
}
