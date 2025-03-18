import * as vscode from 'vscode'

import type {
    ContextItem,
    ContextMessage,
    EditModel,
    EventSource,
    PromptString,
    Rule,
} from '@sourcegraph/cody-shared'

import type {
    FixupTask,
    FixupTaskID,
    FixupTelemetryMetadata,
    SmartApplyAdditionalMetadata,
} from '../non-stop/FixupTask'
import type { EditIntent, EditMode } from './types'

export interface ExecuteEditArguments {
    configuration?: {
        /**
         * The ID to use when creating the FixupTask.
         * This is optional, a FixupTask will assign its own id if not provided.
         * The primary use case is to allow a caller of `executeEdit` to associate
         * a FixupTask result with their intended task.
         */
        id?: FixupTaskID
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
        instruction?: PromptString
        /**
         * A pre-set instruction that will be used to help the user write their instruction.
         * This will prompt the user with this text as a prefix provided in the edit input.
         */
        preInstruction?: PromptString
        userContextFiles?: ContextItem[]
        contextMessages?: ContextMessage[]
        intent?: EditIntent
        mode?: EditMode
        model?: EditModel
        rules?: Rule[] | null
        // The file to write the edit to. If not provided, the edit will be applied to the current file.
        destinationFile?: vscode.Uri
        insertionPoint?: vscode.Position
        /**
         * Additional metadata only specific to Smart Apply Tasks.
         */
        smartApplyMetadata?: SmartApplyAdditionalMetadata
    }
    source?: EventSource
    telemetryMetadata?: FixupTelemetryMetadata
}

/**
 * Used by the agent API.
 */
export type ExecuteEditResult = FixupTask | undefined

/**
 * Wrapper around the `edit-code` command that can be used anywhere but with better type-safety.
 */
export const executeEdit = async (args: ExecuteEditArguments): Promise<ExecuteEditResult> => {
    return vscode.commands.executeCommand<ExecuteEditResult>('cody.command.edit-code', args)
}
