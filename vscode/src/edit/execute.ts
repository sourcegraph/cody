import * as vscode from 'vscode'

import type { ContextItem, ContextMessage, EditModel, EventSource } from '@sourcegraph/cody-shared'

import type { FixupTask, FixupTelemetryMetadata } from '../non-stop/FixupTask'
import type { EditIntent, EditMode } from './types'

export interface ExecuteEditArguments {
    configuration?: {
        /**
         * The document in which to apply the edit.
         * Defaults to the active document.
         */
        document?: vscode.TextDocument
        /**
         * The range in the document in which to apply the edit.
         * Defaults to the active selection rnage.
         */
        range?: vscode.Range
        /**
         * A pre-set instruction that will be used to create the edit.
         * This will skip prompting the user for any other instruction.
         */
        instruction?: string
        /**
         * A pre-set instruction that will be used to help the user write their instruction.
         * This will prompt the user with this text as a prefix provided in the edit input.
         */
        preInstruction?: string
        userContextFiles?: ContextItem[]
        contextMessages?: ContextMessage[]
        intent?: EditIntent
        mode?: EditMode
        model?: EditModel
        // The file to write the edit to. If not provided, the edit will be applied to the current file.
        destinationFile?: vscode.Uri
        insertionPoint?: vscode.Position
    }
    source?: EventSource
    telemetryMetadata?: FixupTelemetryMetadata
}

/**
 * Wrapper around the `edit-code` command that can be used anywhere but with better type-safety.
 */
export const executeEdit = async (args: ExecuteEditArguments): Promise<FixupTask | undefined> => {
    return vscode.commands.executeCommand<FixupTask | undefined>('cody.command.edit-code', args)
}
