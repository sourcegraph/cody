import * as vscode from 'vscode'

import {
    ConfigFeaturesSingleton,
    type ChatEventSource,
    type CodyCommand,
    type ContextFile,
} from '@sourcegraph/cody-shared'

import { executeEdit, type ExecuteEditArguments } from '../edit/execute'
import type { EditIntent, EditMode } from '../edit/types'
import { getEditor } from '../editor/active-editor'
import type { VSCodeEditor } from '../editor/vscode-editor'
import { logDebug } from '../log'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'

import type { CodyCommandArgs } from '.'
import { getContextForCommand } from './utils/get-context'
import { executeChat } from './default-commands'

/**
 * Manages executing a Cody command as either inline edit command or chat command.
 *
 * Handles prompt building and context fetching for commands.
 */
export class CommandRunner implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    public readonly id = `c${Date.now().toString(36).replaceAll(/\d+/g, '')}`

    private editor: vscode.TextEditor | undefined = undefined
    public isFixupRequest = false

    constructor(
        private readonly vscodeEditor: VSCodeEditor,
        public readonly command: CodyCommand,
        private readonly args: CodyCommandArgs
    ) {
        logDebug('CommandRunner:constructor', command.slashCommand, { verbose: { command, args } })

        // If runInChatMode is true, set mode to 'ask' to run as chat command
        // This allows callers to run edit commands in chat mode
        if (args.runInChatMode) {
            command.mode = 'ask'
        } else {
            const isEditPrompt = command.prompt.startsWith('/edit ')
            command.mode = isEditPrompt ? 'edit' : command.mode || 'ask'
        }

        // update prompt with additional input added at the end
        command.prompt = [this.command.prompt, this.command.additionalInput].join(' ')?.trim()
        this.isFixupRequest = command.mode !== 'ask'
        this.command = command
    }

    /**
     * Starts execution of the Cody command.
     *
     * Logs the request, gets the active editor, handles errors if no editor,
     * Runs fixup if it is a fixup request, otherwise handles it as a chat request.
     */
    public async start(): Promise<void> {
        // all user and workspace custom command should be logged under 'custom'
        const name =
            this.command.type === 'default' ? this.command.slashCommand.replace('/', '') : 'custom'
        if (this.command.mode === 'ask') {
            telemetryService.log(`CodyVSCodeExtension:command:${name}:executed`, {
                mode: this.command.mode,
                useCodebaseContex: !!this.command.context?.codebase,
                useShellCommand: !!this.command.context?.command,
                requestID: this.args.requestID,
                source: this.args.source,
            })
            telemetryRecorder.recordEvent(`cody.command.${name}`, 'executed', {
                metadata: {
                    useCodebaseContex: this.command.context?.codebase ? 1 : 0,
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

        const editor = getEditor()
        if (editor.ignored && !editor.active) {
            const errorMsg = 'Failed to create command: file was ignored by Cody.'
            logDebug('CommandRunner:int:fail', errorMsg)
            void vscode.window.showErrorMessage(errorMsg)
            return
        }

        this.editor = editor.active
        if (!this.editor && !this.command.context?.none && this.command.slashCommand !== '/ask') {
            const errorMsg = 'Failed to create command: No active text editor found.'
            logDebug('CommandRunner:int:fail', errorMsg)
            void vscode.window.showErrorMessage(errorMsg)
            return
        }

        // Run fixup if this is a edit command
        if (this.isFixupRequest) {
            return this.handleFixupRequest(this.command.mode === 'insert')
        }

        return this.handleChatRequest()
    }

    /**
     * Handles a Cody chat command.
     *
     * Executes the chat request with the prompt and context files
     */
    private async handleChatRequest(): Promise<void> {
        const prompt = this.command.prompt

        const contextMessages = await getContextForCommand(this.vscodeEditor, this.command)
        const filteredMessages = contextMessages?.filter(msg => msg.file !== undefined)
        const contextFiles = filteredMessages?.map(msg => msg.file) as ContextFile[]

        return executeChat(prompt, {
            userContextFiles: contextFiles ?? [],
            addEnhancedContext: this.command.context?.codebase ?? false,
            source: this.args.source,
        })
    }

    /**
     * handleFixupRequest method handles executing fixup based on editor selection.
     *
     * Creates range and instruction, calls fixup command.
     */
    private async handleFixupRequest(insertMode = false): Promise<void> {
        logDebug('CommandRunner:handleFixupRequest', 'fixup request detected')
        const configFeatures = await ConfigFeaturesSingleton.getInstance().getConfigFeatures()

        if (!configFeatures.commands) {
            const disabledMsg = 'This feature has been disabled by your Sourcegraph site admin.'
            void vscode.window.showErrorMessage(disabledMsg)
            return
        }

        const commandKey = this.command.slashCommand.replace(/^\//, '')
        const isFileMode = this.command.mode === 'file'
        const isDocKind = this.command.slashCommand === '/doc'
        const isDefaultCommand = this.command.type === 'default'

        const intent: EditIntent = isDocKind ? 'doc' : isFileMode ? 'new' : 'edit'
        const instruction = this.command.prompt
        const source = isDefaultCommand ? commandKey : 'custom-commands'

        const contextMessages = await getContextForCommand(this.vscodeEditor, this.command)

        await executeEdit(
            {
                instruction,
                intent,
                mode: this.command.mode as EditMode,
                contextMessages,
            } satisfies ExecuteEditArguments,
            source as ChatEventSource
        )
    }

    /**
     * dispose method cleans up disposables.
     */
    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
