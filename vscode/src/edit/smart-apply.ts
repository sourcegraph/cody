import type { EditModel, PromptString } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { FixupTask } from '../non-stop/FixupTask'

export interface SmartApplyArguments {
    configuration?: {
        instruction: PromptString
        replacement: string
        document: vscode.TextDocument
        model: EditModel
    }
}

/**
 * Wrapper around the `smart-apply` command that can be used anywhere but with better type-safety.
 */
export const executeSmartApply = async (args: SmartApplyArguments): Promise<FixupTask | undefined> => {
    return vscode.commands.executeCommand<FixupTask | undefined>('cody.command.smart-apply', args)
}
