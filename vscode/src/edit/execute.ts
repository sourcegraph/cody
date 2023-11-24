import * as vscode from 'vscode'

import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { FixupIntent } from '@sourcegraph/cody-shared/src/editor'

export interface ExecuteEditArguments {
    document?: vscode.TextDocument
    instruction?: string
    intent?: FixupIntent
    range?: vscode.Range
    insertMode?: boolean
}

/**
 * Wrapper around the `edit-code` command that can be used anywhere but with better type-safety.
 */
export const executeEdit = async (args: ExecuteEditArguments, source: ChatEventSource): Promise<void> => {
    await vscode.commands.executeCommand('cody.command.edit-code', args, source)
}
