import * as vscode from 'vscode'

import { ContextFile } from '@sourcegraph/cody-shared'
import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { EditIntent } from './types'

export interface ExecuteEditArguments {
    document?: vscode.TextDocument
    instruction?: string
    userContextFiles?: ContextFile[]
    intent?: EditIntent
    range?: vscode.Range
    insertMode?: boolean
}

/**
 * Wrapper around the `edit-code` command that can be used anywhere but with better type-safety.
 */
export const executeEdit = async (args: ExecuteEditArguments, source: ChatEventSource): Promise<void> => {
    await vscode.commands.executeCommand('cody.command.edit-code', args, source)
}
