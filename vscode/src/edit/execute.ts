import * as vscode from 'vscode'

import { type CodyCommand, type ContextFile } from '@sourcegraph/cody-shared'
import { type ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { type EditIntent, type EditMode } from './types'

export interface ExecuteEditArguments {
    document?: vscode.TextDocument
    instruction?: string
    userContextFiles?: ContextFile[]
    intent?: EditIntent
    range?: vscode.Range
    mode?: EditMode
    command?: CodyCommand
}

/**
 * Wrapper around the `edit-code` command that can be used anywhere but with better type-safety.
 */
export const executeEdit = async (args: ExecuteEditArguments, source: ChatEventSource): Promise<void> => {
    await vscode.commands.executeCommand('cody.command.edit-code', args, source)
}
