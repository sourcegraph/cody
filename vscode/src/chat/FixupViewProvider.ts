import * as vscode from 'vscode'

import { contentSanitizer } from '@sourcegraph/cody-shared/src/chat/recipes/helpers'
import { ChatMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { FixupCodeAction } from '../code-actions/fixup'
import { FixupTask } from '../non-stop/FixupTask'

import { MessageProvider, MessageProviderOptions } from './MessageProvider'

export class FixupManager implements vscode.Disposable {
    private fixupProviders = new Map<FixupTask, FixupProvider>()
    private messageProviderOptions: MessageProviderOptions
    private configurationChangeListener: vscode.Disposable
    private codeActionProvider: vscode.Disposable | null = null

    constructor(options: MessageProviderOptions) {
        this.messageProviderOptions = options
        this.configureCodeAction(options.contextProvider.config.codeActions)
        this.configurationChangeListener = options.contextProvider.configurationChangeEvent.event(() => {
            this.configureCodeAction(options.contextProvider.config.codeActions)
        })
    }

    private configureCodeAction(enabled: boolean): void {
        // Disable the code action provider if currently enabled
        if (!enabled) {
            this.codeActionProvider?.dispose()
            this.codeActionProvider = null
            return
        }

        // Code action provider already exists, skip re-registering
        if (this.codeActionProvider) {
            return
        }

        this.codeActionProvider = vscode.languages.registerCodeActionsProvider('*', new FixupCodeAction(), {
            providedCodeActionKinds: FixupCodeAction.providedCodeActionKinds,
        })
    }

    public getProviderForTask(task: FixupTask): FixupProvider {
        let provider = this.fixupProviders.get(task)

        if (!provider) {
            provider = new FixupProvider({ task, ...this.messageProviderOptions })
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
        this.configurationChangeListener.dispose()
        this.codeActionProvider?.dispose()
        this.codeActionProvider = null
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
        const lastMessage = transcript.at(-1)

        // The users' messages are already added through the comments API.
        if (lastMessage?.speaker !== 'assistant') {
            return
        }

        // Error state: The transcript finished but we didn't receive any text
        if (!lastMessage.text && !isMessageInProgress) {
            this.handleError('Error: Cody did not respond with any text')
        }

        if (lastMessage.text) {
            void this.editor.controllers.fixups?.didReceiveFixupText(
                this.task.id,
                isMessageInProgress ? lastMessage.text : contentSanitizer(lastMessage.text),
                isMessageInProgress ? 'streaming' : 'complete'
            )
        }
    }

    /**
     * Display an erred codelens to the user on failed fixup apply.
     * Will allow the user to view the error in more detail if needed.
     */
    protected handleError(errorMsg: string): void {
        this.editor.controllers.fixups?.error(this.task.id, errorMsg)
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

    protected handleMyPrompts(): void {
        // not implemented
    }
}
