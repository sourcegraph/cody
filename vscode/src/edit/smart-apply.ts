import type { EditModel, PromptString } from '@sourcegraph/cody-shared'
import type { EventSource } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { FixupTask, FixupTaskID } from '../non-stop/FixupTask'

export interface SmartApplyArguments {
    configuration?: {
        id: FixupTaskID
        instruction: PromptString
        replacement: string
        document: vscode.TextDocument
        model?: EditModel
        isNewFile?: boolean
        traceparent: string | undefined | null
    }
    source?: EventSource
}

/**
 * Wrapper around the `smart-apply` command that can be used anywhere but with better type-safety.
 */
export const executeSmartApply = async (args: SmartApplyArguments): Promise<FixupTask | undefined> => {
    return vscode.commands.executeCommand<FixupTask | undefined>('cody.command.smart-apply', args)
}
