import * as vscode from 'vscode'

import type { Span } from '@opentelemetry/api'
import {
    type ChatEventSource,
    type CodyCommand,
    ConfigFeaturesSingleton,
    type ContextItem,
} from '@sourcegraph/cody-shared'

import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import type { EditMode } from '../../edit/types'
import { logDebug } from '../../log'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'

import { sortContextFiles } from '../../chat/chat-view/agentContextSorting'
import { getEditor } from '../../editor/active-editor'
import type { ChatCommandResult, CommandResult, EditCommandResult } from '../../main'
import { getCommandContextFiles } from '../context'
import { executeChat } from '../execute/ask'
import type { CodyCommandArgs } from '../types'

/**
 * NOTE: Used by Command Controller only.
 * NOTE: Execute Custom Commands only
 *
 * Handles executing a Cody Custom Command.
 * It sorts the given command into:
 * - an inline edit command (mode !== 'ask), or;
 * - a chat command (mode === 'ask')
 *
 * Handles prompt building and context fetching for commands.
 */
export class CommandRunner implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    constructor(
        private span: Span,
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
     * Starts executing the Cody Custom Command.
     */
    public async start(): Promise<CommandResult | undefined> {
        // NOTE: Default commands are processed in controller
        if (this.command.type === 'default') {
            console.error('Default commands are not supported in runner.')
            return undefined
        }

        const addCodebaseContex = false
        telemetryService.log('CodyVSCodeExtension:command:custom:executed', {
            mode: this.command.mode,
            useCodebaseContex: addCodebaseContex,
            useShellCommand: !!this.command.context?.command,
            requestID: this.args.requestID,
            source: this.args.source,
            traceId: this.span.spanContext().traceId,
        })
        telemetryRecorder.recordEvent('cody.command.custom', 'executed', {
            metadata: {
                useCodebaseContex: addCodebaseContex ? 1 : 0,
                useShellCommand: this.command.context?.command ? 1 : 0,
            },
            interactionID: this.args.requestID,
            privateMetadata: {
                mode: this.command.mode,
                requestID: this.args.requestID,
                source: this.args.source,
                traceId: this.span.spanContext().traceId,
            },
        })

        // Conditions checks
        const configFeatures = await ConfigFeaturesSingleton.getInstance().getConfigFeatures()
        if (!configFeatures.commands) {
            const disabledMsg = 'This feature has been disabled by your Sourcegraph site admin.'
            void vscode.window.showErrorMessage(disabledMsg)
            this.span.end()
            return
        }
        const editor = getEditor()
        if (!editor.active || editor.ignored) {
            const message = editor.ignored
                ? 'Current file is ignored by a .cody/ignore file. Please remove it from the list and try again.'
                : 'No editor is active. Please open a file and try again.'
            void vscode.window.showErrorMessage(message)
            this.span.end()
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
        this.span.setAttribute('mode', 'chat')
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
                source: 'custom-commands',
            }),
        }
    }

    /**
     * handleFixupRequest method handles executing fixup based on editor selection.
     * Creates range and instruction, calls fixup command.
     */
    private async handleEditRequest(): Promise<EditCommandResult | undefined> {
        this.span.setAttribute('mode', 'edit')
        logDebug('CommandRunner:handleEditRequest', 'fixup request detected')

        // Fetch context for the command
        const userContextFiles = await this.getContextFiles()

        return {
            type: 'edit',
            task: await executeEdit({
                configuration: {
                    instruction: this.command.prompt,
                    intent: 'edit',
                    mode: this.command.mode as EditMode,
                    userContextFiles,
                },
                source: 'custom-commands' as ChatEventSource,
            } satisfies ExecuteEditArguments),
        }
    }

    /**
     * Combine userContextFiles and context fetched for the command
     */
    private async getContextFiles(): Promise<ContextItem[]> {
        const contextConfig = this.command.context
        this.span.setAttribute('contextConfig', JSON.stringify(contextConfig))

        const userContextFiles = this.args.userContextFiles ?? []
        if (contextConfig) {
            const commandContext = await getCommandContextFiles(contextConfig)
            userContextFiles.push(...commandContext)
        }

        sortContextFiles(userContextFiles)

        return userContextFiles
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
