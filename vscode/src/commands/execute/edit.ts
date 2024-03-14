import { DefaultEditCommands } from '@sourcegraph/cody-shared/src/commands/types'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getEditor } from '../../editor/active-editor'
import type { EditCommandResult } from '../../main'

import { wrapInActiveSpan } from '@sourcegraph/cody-shared/src/tracing'

export async function executeEditCommand(
    args: ExecuteEditArguments
): Promise<EditCommandResult | undefined> {
    return wrapInActiveSpan('command.test', async span => {
        span.setAttribute('sampled', true)
        const instruction = args.configuration?.instruction // get the instruction
        const editor = getEditor()?.active // get the active editor
        const document = editor?.document // get the document from the editor
        if (!document || !instruction) {
            return
        }

        // execute the edit with the provided configuration
        return {
            type: 'edit',
            task: await executeEdit({
                configuration: {
                    ...args.configuration,
                    instruction,
                    document,
                    mode: 'edit',
                },
                source: DefaultEditCommands.Test,
            } satisfies ExecuteEditArguments),
        }
    })

}
