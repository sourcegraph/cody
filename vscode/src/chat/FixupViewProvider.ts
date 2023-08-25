import * as vscode from 'vscode'

import { contentSanitizer } from '@sourcegraph/cody-shared/src/chat/recipes/helpers'
import { ChatMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { FixupCodeAction } from '../code-actions/fixup'
import { FixupTask } from '../non-stop/FixupTask'

import { MessageProvider, MessageProviderOptions } from './MessageProvider'

interface FixupManagerOptions extends MessageProviderOptions {}

export class FixupManager implements vscode.Disposable {
    private fixupProviders = new Map<FixupTask, FixupProvider>()
    private options: FixupManagerOptions
    private disposables: vscode.Disposable[] = []

    constructor(options: FixupManagerOptions) {
        this.options = options
        this.disposables.push(
            vscode.languages.registerCodeActionsProvider('*', new FixupCodeAction(), {
                providedCodeActionKinds: FixupCodeAction.providedCodeActionKinds,
            })
        )
    }

    public async createFixup(
        options: {
            document?: vscode.TextDocument
            instruction?: string
            range?: vscode.Range
        } = {}
    ): Promise<void> {
        const fixupController = this.options.editor.controllers.fixups
        if (!fixupController) {
            return
        }

        const document = options.document || vscode.window.activeTextEditor?.document
        if (!document) {
            return
        }

        const range = options.range || vscode.window.activeTextEditor?.selection
        if (!range) {
            return
        }

        const task = options.instruction?.replace('/fix', '').trim()
            ? fixupController.createTask(document.uri, options.instruction, range)
            : await fixupController.promptUserForTask()
        if (!task) {
            return
        }

        this.options.telemetryService.log('CodyVSCodeExtension:fixup:created')
        const provider = this.getProviderForTask(task)
        return provider.startFix()
    }

    public getProviderForTask(task: FixupTask): FixupProvider {
        let provider = this.fixupProviders.get(task)

        if (!provider) {
            provider = new FixupProvider({ task, ...this.options })
            this.fixupProviders.set(task, provider)
        }

        return provider
    }

    public removeProviderForTask(task: FixupTask): void {
        const provider = this.fixupProviders.get(task)

        if (provider) {
            this.fixupProviders.delete(task)
            provider.dispose()
        }
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}

interface FixupProviderOptions extends MessageProviderOptions {
    task: FixupTask
}

export class FixupProvider extends MessageProvider {
    private task: FixupTask

    constructor({ task, ...options }: FixupProviderOptions) {
        super(options)
        this.task = task
    }

    public async startFix(): Promise<void> {
        await this.executeRecipe('fixup', this.task.id)
    }

    public async abortFix(): Promise<void> {
        await this.abortCompletion()
    }

    /**
     * Send transcript to the fixup
     */
    protected handleTranscript(transcript: ChatMessage[], isMessageInProgress: boolean): void {
        const lastMessage = transcript[transcript.length - 1]

        // The users' messages are already added through the comments API.
        if (lastMessage?.speaker !== 'assistant') {
            return
        }

        if (lastMessage.displayText) {
            void this.editor.controllers.fixups?.didReceiveFixupText(
                this.task.id,
                isMessageInProgress ? lastMessage.displayText : contentSanitizer(lastMessage.displayText),
                isMessageInProgress ? 'streaming' : 'complete'
            )
        }
    }

    /**
     * TODO: How should we handle errors for fixups?
     * Should we create a new inline chat with the message?
     */
    protected handleError(errorMsg: string): void {
        void this.editor.controllers.inline?.error(errorMsg)
    }

    protected handleTranscriptErrors(): void {
        // not implemented
    }

    protected handleCodyCommands(): void {
        // not implemented
    }

    protected handleHistory(): void {
        // not implemented
    }

    protected handleSuggestions(): void {
        // not implemented
    }

    protected handleEnabledPlugins(): void {
        // not implemented
    }

    protected handleMyPrompts(): void {
        // not implemented
    }
}
