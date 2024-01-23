import type { ContextFile } from '@sourcegraph/cody-shared'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getEditor } from '../../editor/active-editor'
import { getContextFileFromCursor } from '../context/get-cursor-context'

/**
 * The command that generates a new docstring for the selected code.
 * When calls, the command will be executed as an inline-edit command.
 */
export async function executeDocCommand(): Promise<void> {
    const prompt =
        'Write a brief documentation comment for the selected code. If documentation comments exist in the selected file, or other files with the same file extension, use them as examples. Pay attention to the scope of the selected code (e.g. exported function/API vs implementation detail in a function), and use the idiomatic style for that type of code scope. Only generate the documentation for the selected code, do not generate the code. Do not enclose any other code or comments besides the documentation. Enclose only the documentation for the selected code and nothing else.'

    const contextFiles: ContextFile[] = []
    const contextFile = await getContextFileFromCursor()
    if (contextFile) {
        contextFiles.push(contextFile)
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
        'doc'
    )
}
