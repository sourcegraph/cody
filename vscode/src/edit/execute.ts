import * as vscode from 'vscode'

import type { ChatEventSource, ContextFile, ContextMessage } from '@sourcegraph/cody-shared'

import type { EditIntent, EditMode } from './types'
import type { FixupTask } from '../non-stop/FixupTask'

export interface ExecuteEditArguments {
    document?: vscode.TextDocument
    instruction?: string
    userContextFiles?: ContextFile[]
    contextMessages?: ContextMessage[]
    intent?: EditIntent
    range?: vscode.Range
    mode?: EditMode
}

/**
 * Wrapper around the `edit-code` command that can be used anywhere but with better type-safety.
 */
export const executeEdit = async (
    args: ExecuteEditArguments,
    source: ChatEventSource
): Promise<FixupTask | undefined> => {
    return vscode.commands.executeCommand<FixupTask | undefined>('cody.command.edit-code', args, source)
}
