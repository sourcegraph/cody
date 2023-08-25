import * as vscode from 'vscode'

import { ChatMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { IntentClassificationOption } from '@sourcegraph/cody-shared/src/intent-detector'

import { ExplainCodeAction } from '../code-actions/explain'

import { FixupManager } from './FixupViewProvider'
import { MessageProvider, MessageProviderOptions } from './MessageProvider'

interface InlineChatViewManagerOptions extends MessageProviderOptions {
    fixupManager: FixupManager
}

export class InlineChatViewManager implements vscode.Disposable {
    private inlineChatThreadProviders = new Map<vscode.CommentThread, InlineChatViewProvider>()
    private options: InlineChatViewManagerOptions
    private disposables: vscode.Disposable[] = []

    constructor(options: InlineChatViewManagerOptions) {
        this.options = options
        this.disposables.push(
            vscode.languages.registerCodeActionsProvider('*', new ExplainCodeAction(), {
                providedCodeActionKinds: ExplainCodeAction.providedCodeActionKinds,
            })
        )

        // Remove all the threads from current file on file close
        vscode.workspace.onDidCloseTextDocument(doc => {
            // Skip if the document is not a file
            if (doc.uri.scheme !== 'file') {
                return
            }
            const threadsInDoc = [...this.inlineChatThreadProviders.keys()].filter(
                thread => thread.uri.fsPath === doc.uri.fsPath
            )
            for (const thread of threadsInDoc) {
                this.removeProviderForThread(thread)
            }
        })
    }

    public getProviderForThread(thread: vscode.CommentThread): InlineChatViewProvider {
        let provider = this.inlineChatThreadProviders.get(thread)

        if (!provider) {
            provider = new InlineChatViewProvider({ thread, ...this.options })
            this.inlineChatThreadProviders.set(thread, provider)
        }

        return provider
    }

    public removeProviderForThread(thread: vscode.CommentThread): void {
        const provider = this.inlineChatThreadProviders.get(thread)

        if (provider) {
            this.inlineChatThreadProviders.delete(thread)
            provider.removeChat()
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

export type InlineIntent = 'fix' | 'chat'
const InlineIntentClassification: IntentClassificationOption<InlineIntent>[] = [
    {
        id: 'fix',
        rawCommand: '/fix',
        description: 'Edit part of the selected code',
        examplePrompts: ['simplify this', 'add comments'],
    },
    {
        id: 'chat',
        rawCommand: '/chat',
        description: 'Ask a question about the selected code',
        examplePrompts: [
            'How can I improve this?',
            'what does this do',
            'how does this work',
            'Find bugs in this code',
        ],
    },
]

interface InlineChatViewProviderOptions extends InlineChatViewManagerOptions {
    thread: vscode.CommentThread
}

export class InlineChatViewProvider extends MessageProvider {
    private thread: vscode.CommentThread
    private fixupManager: FixupManager
    // A repeating, text-based, loading indicator ("." -> ".." -> "...")
    private responsePendingInterval: NodeJS.Timeout | null = null

    constructor({ thread, fixupManager, ...options }: InlineChatViewProviderOptions) {
        super(options)
        this.thread = thread
        this.fixupManager = fixupManager
    }

    public async addChat(reply: string): Promise<void> {
        this.editor.controllers.inline?.chat(reply, this.thread)
        const intent = await this.intentDetector.classifyIntentFromOptions(reply, InlineIntentClassification, 'fix')
        switch (intent) {
            case 'fix':
                return this.startFix(reply)
            case 'chat':
                this.setResponsePending(true)
                return this.startChat(reply)
        }
    }

    private async startChat(instruction: string): Promise<void> {
        const interaction = this.editor.controllers.inline?.createInteraction(instruction, this.thread)
        if (!interaction) {
            return
        }

        return this.executeRecipe('inline-chat', interaction.id)
    }

    private async startFix(instruction: string): Promise<void> {
        this.removeChat()
        const activeDocument = await vscode.workspace.openTextDocument(this.thread.uri)
        return this.fixupManager.createFixup({ document: activeDocument, instruction, range: this.thread.range })
    }

    public removeChat(): void {
        this.editor.controllers.inline?.delete(this.thread)
    }

    public async abortChat(): Promise<void> {
        this.setResponsePending(false)
        this.editor.controllers.inline?.abort(this.thread)
        await this.abortCompletion()
    }

    /**
     * Display a "..." loading style reply from Cody.
     */
    public setResponsePending(isResponsePending: boolean): void {
        let iterations = 0

        if (!isResponsePending) {
            if (this.responsePendingInterval) {
                clearInterval(this.responsePendingInterval)
                this.responsePendingInterval = null
                iterations = 0
            }
            return
        }

        const dot = '.'
        this.editor.controllers.inline?.reply(dot, this.thread, 'loading')
        this.responsePendingInterval = setInterval(() => {
            iterations++
            const replyText = dot.repeat((iterations % 3) + 1)
            this.editor.controllers.inline?.reply(replyText, this.thread, 'loading')
        }, 500)
    }

    /**
     * Send transcript to the active inline chat thread.
     */
    protected handleTranscript(transcript: ChatMessage[], isMessageInProgress: boolean): void {
        const lastMessage = transcript[transcript.length - 1]

        // The users' messages are already added through the comments API.
        if (lastMessage?.speaker !== 'assistant') {
            return
        }

        if (lastMessage.displayText) {
            this.setResponsePending(false)
            this.editor.controllers.inline?.reply(
                lastMessage.displayText,
                this.thread,
                isMessageInProgress ? 'streaming' : 'complete'
            )
        }
    }

    /**
     * Display error message in the active inline chat thread..
     * Unlike the sidebar, this message is displayed as an assistant response.
     * TODO(umpox): Should we render these differently for inline chat? We are limited in UI options.
     */
    protected handleError(errorMsg: string): void {
        void this.editor.controllers.inline?.error(errorMsg, this.thread)
    }

    protected handleHistory(): void {
        // navigating history not yet implemented for inline chat
    }

    protected handleSuggestions(): void {
        // showing suggestions not yet implemented for inline chat
    }

    protected handleEnabledPlugins(): void {
        // plugins not yet implemented for inline chat
    }

    protected handleCodyCommands(): void {
        // my prompts not yet implemented for inline chat
    }

    protected handleTranscriptErrors(): void {
        // handle transcript errors not yet implemented for inline chat
    }
}
