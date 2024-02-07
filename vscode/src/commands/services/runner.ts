import * as vscode from 'vscode'

import {
    ConfigFeaturesSingleton,
    type ChatEventSource,
    type CodyCommand,
    type ContextFile,
} from '@sourcegraph/cody-shared'

import { executeEdit, type ExecuteEditArguments } from '../../edit/execute'
import type { EditMode } from '../../edit/types'
import { logDebug } from '../../log'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'

import type { CodyCommandArgs } from '../types'
import { getCommandContextFiles } from '../context'
import { executeChat } from '../execute/ask'
import type { ChatCommandResult, CommandResult, EditCommandResult } from '../../main'
import { getEditor } from '../../editor/active-editor'

/**
 * NOTE: Used by Command Controller only.
 *
 * Handles executing a Cody custom command.
 * It sorts the given command into:
 * - an inline edit command (mode !== 'ask), or;
 * - a chat command (mode === 'ask')
 *
 * Handles prompt building and context fetching for commands.
 */
export class CommandRunner implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    constructor(
        private readonly command: CodyCommand,
        private readonly args: CodyCommandArgs
    ) {
        logDebug('CommandRunner', command.key, { verbose: { command, args } })
        // If runInChatMode is true, set mode to 'ask' to run as chat command
        // This allows users to run any edit commands in chat mode
        command.mode = args.runInChatMode ? 'ask' : command.mode ?? 'ask'

        this.command = command
    }

    /**
     * Starts executing the Cody command.
     */
    public async start(): Promise<CommandResult | undefined> {
        // all user and workspace custom command should be logged under 'custom'
        const name = this.command.type === 'default' ? this.command.key : 'custom'

        // Only log the chat commands (mode === ask) to avoid double logging by the edit commands
        if (this.command.mode === 'ask') {
            // NOTE: codebase context is not supported for custom commands
            const addCodebaseContex = false
            telemetryService.log(`CodyVSCodeExtension:command:${name}:executed`, {
                mode: this.command.mode,
                useCodebaseContex: addCodebaseContex,
                useShellCommand: !!this.command.context?.command,
                requestID: this.args.requestID,
                source: this.args.source,
            })
            telemetryRecorder.recordEvent(`cody.command.${name}`, 'executed', {
                metadata: {
                    useCodebaseContex: addCodebaseContex ? 1 : 0,
                    useShellCommand: this.command.context?.command ? 1 : 0,
                },
                interactionID: this.args.requestID,
                privateMetadata: {
                    mode: this.command.mode,
                    requestID: this.args.requestID,
                    source: this.args.source,
                },
            })
        }

        // Conditions checks
        const configFeatures = await ConfigFeaturesSingleton.getInstance().getConfigFeatures()
        if (!configFeatures.commands) {
            const disabledMsg = 'This feature has been disabled by your Sourcegraph site admin.'
            void vscode.window.showErrorMessage(disabledMsg)
            return
        }
        const editor = getEditor()
        if (!editor.active || editor.ignored) {
            const message = editor.ignored
                ? 'Current file is ignored by a .cody/ignore file. Please remove it from the list and try again.'
                : 'No editor is active. Please open a file and try again.'
            void vscode.window.showErrorMessage(message)
            return
        }

        // Execute the command based on the mode
        // Run as edit command if mode is not 'ask'
        if (this.command.mode !== 'ask') {
            return this.handleEditRequest()
        }

        return this.handleChatRequest()
    }

    /**
     * Handles a Cody chat command.
     * Executes the chat request with the prompt and context files
     */
    private async handleChatRequest(): Promise<ChatCommandResult | undefined> {
        logDebug('CommandRunner:handleChatRequest', 'chat request detecte')

        const prompt = this.command.prompt

        // Fetch context for the command
        const contextFiles = await this.getContextFiles()

        // NOTE: (bee) codebase context is not supported for custom commands
        return {
            type: 'chat',
            session: await executeChat({
                text: prompt,
                submitType: 'user',
                contextFiles,
                addEnhancedContext: this.command.context?.codebase ?? false,
                source: this.args.source,
            }),
        }
    }

    /**
     * handleFixupRequest method handles executing fixup based on editor selection.
     * Creates range and instruction, calls fixup command.
     */
    private async handleEditRequest(): Promise<EditCommandResult | undefined> {
        logDebug('CommandRunner:handleEditRequest', 'fixup request detected')

        // Conditions for categorizing an edit command
        const commandKey = this.command.key
        const isDefaultCommand = this.command.type === 'default'
        const instruction = this.command.prompt
        const source = isDefaultCommand ? commandKey : 'custom-commands'

        // Fetch context for the command
        const userContextFiles = await this.getContextFiles()

        return {
            type: 'edit',
            task: await executeEdit({
                configuration: {
                    instruction,
                    intent: 'edit',
                    mode: this.command.mode as EditMode,
                    userContextFiles,
                },
                source: source as ChatEventSource,
            } satisfies ExecuteEditArguments),
        }
    }

    /**
     * Combine userContextFiles and context fetched for the command
     */
    private async getContextFiles(): Promise<ContextFile[]> {
        const userContextFiles = this.args.userContextFiles ?? []
        const contextConfig = this.command.context
        if (contextConfig) {
            const commandContext = await getCommandContextFiles(contextConfig)
            userContextFiles.push(...commandContext)
        }

        return userContextFiles
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
