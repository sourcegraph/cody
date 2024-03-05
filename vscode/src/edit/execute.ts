import * as vscode from 'vscode'

import type { ChatEventSource, ContextItem, ContextMessage, EditModel } from '@sourcegraph/cody-shared'

import type { FixupTask } from '../non-stop/FixupTask'
import type { EditIntent, EditMode } from './types'

export interface ExecuteEditArguments {
    configuration?: {
        document?: vscode.TextDocument
        instruction?: string
        userContextFiles?: ContextItem[]
        contextMessages?: ContextMessage[]
        intent?: EditIntent
        range?: vscode.Range
        mode?: EditMode
        model?: EditModel
        // The file to write the edit to. If not provided, the edit will be applied to the current file.
        destinationFile?: vscode.Uri
    }
    source?: ChatEventSource
}

/**
 * Wrapper around the `edit-code` command that can be used anywhere but with better type-safety.
 */
export const executeEdit = async (args: ExecuteEditArguments): Promise<FixupTask | undefined> => {
    return vscode.commands.executeCommand<FixupTask | undefined>('cody.command.edit-code', args)
}
