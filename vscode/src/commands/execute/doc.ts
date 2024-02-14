import { logDebug } from '@sourcegraph/cody-shared'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getEditor } from '../../editor/active-editor'
import { DefaultEditCommands } from '@sourcegraph/cody-shared/src/commands/types'
import { defaultCommands } from '.'
import type { EditCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'

import { tracer } from '@sourcegraph/cody-shared/src/tracing'

/**
 * The command that generates a new docstring for the selected code.
 * When calls, the command will be executed as an inline-edit command.
 *
 * Context: add by the edit command
 */
export async function executeDocCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
    return tracer.startActiveSpan(
        'command.doc',
        async (span): Promise<EditCommandResult | undefined> => {
            logDebug('executeDocCommand', 'executing', { args })
            let prompt = defaultCommands.doc.prompt

            if (args?.additionalInstruction) {
                span.addEvent('additionalInstruction')
                prompt = `${prompt} ${args.additionalInstruction}`
            }

            const editor = getEditor()?.active
            const document = editor?.document

            if (!document) {
                span.end()
                return undefined
            }

            return {
                type: 'edit',
                task: await executeEdit({
                    configuration: {
                        instruction: prompt,
                        intent: 'doc',
                        mode: 'insert',
                    },
                    source: DefaultEditCommands.Doc,
                } satisfies ExecuteEditArguments),
            }
        }
    )
}
