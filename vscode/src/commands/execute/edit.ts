import { DefaultEditCommands, wrapInActiveSpan } from '@sourcegraph/cody-shared'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getEditor } from '../../editor/active-editor'
import type { EditCommandResult } from '../../main'

export async function executeEditCommand(
    args: ExecuteEditArguments
): Promise<EditCommandResult | undefined> {
    return wrapInActiveSpan('command.edit', async span => {
        span.setAttribute('sampled', true)
        const instruction = args.configuration?.instruction
        const document = getEditor()?.active?.document
        if (!document || !instruction) {
            return
        }

        return {
            type: 'edit',
            task: await executeEdit({
                configuration: {
                    ...args.configuration,
                    instruction,
                    document,
                    mode: 'edit',
                },
                source: DefaultEditCommands.Edit,
            } satisfies ExecuteEditArguments),
        }
    })
}
