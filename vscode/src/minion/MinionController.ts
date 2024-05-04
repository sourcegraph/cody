import type Anthropic from '@anthropic-ai/sdk'
import { hydrateAfterPostMessage } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type {
    MinionExtensionMessage,
    MinionWebviewMessage,
} from '../../webviews/minion/webview_protocol'
import { InitDoer } from '../chat/chat-view/InitDoer'

/**
 * Message sent from webview
 */
type BaseWebviewMessage = {
    type: 'ready'
}

/**
 * Message sent from extension host
 */
type BaseExtensionMessage = {
    type: 'webview-state'
    isActive: boolean
}

export abstract class ReactPanelController<WebviewMessageT extends {}, ExtensionMessageT extends {}>
    implements vscode.Disposable
{
    private initDoer = new InitDoer<boolean | undefined>()

    public static async createAndInit<T extends ReactPanelController<any, any>>(
        ctor: () => T
    ): Promise<T> {
        const agentManager = ctor()
        await agentManager.initPanel()
        return agentManager
    }

    private disposables: vscode.Disposable[] = []

    constructor(
        private panel: vscode.WebviewPanel,
        private assetRoot: vscode.Uri,
        private onDidDisposePanel?: () => void
    ) {}

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
    }

    // Should only be called once, during initialization
    private async initPanel(): Promise<void> {
        // const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')
        // panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'active-chat-icon.svg')

        // Reset the webview options to ensure localResourceRoots is up-to-date
        this.panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.assetRoot],
            enableCommandUris: true,
        }

        const webviewPath = vscode.Uri.joinPath(this.assetRoot)

        // Create Webview using vscode/index.html
        const root = vscode.Uri.joinPath(webviewPath, 'minion.html')
        const bytes = await vscode.workspace.fs.readFile(root)
        const decoded = new TextDecoder('utf-8').decode(bytes)
        const resources = this.panel.webview.asWebviewUri(webviewPath)

        // This replace variables from the vscode/dist/index.html with webview info
        // 1. Update URIs to load styles and scripts into webview (eg. path that starts with ./)
        // 2. Update URIs for content security policy to only allow specific scripts to be run
        this.panel.webview.html = decoded
            .replaceAll('./', `${resources.toString()}/`)
            .replaceAll('{cspSource}', this.panel.webview.cspSource)

        // Dispose everything when the panel is closed
        this.panel.onDidDispose(() => {
            this.dispose()
            if (this.onDidDisposePanel) {
                this.onDidDisposePanel()
            }
        })

        // Let the webview know if it is active
        this.panel.onDidChangeViewState(event =>
            this.postMessage({
                type: 'webview-state',
                isActive: event.webviewPanel.active,
            })
        )

        this.disposables.push(
            this.panel.webview.onDidReceiveMessage(message => {
                this._handleDidReceiveMessage(
                    hydrateAfterPostMessage(message, uri => vscode.Uri.from(uri as any))
                )
            })
        )
    }

    private handleReady(): void {
        this.initDoer.signalInitialized()
    }

    private _handleDidReceiveMessage(message: WebviewMessageT | BaseWebviewMessage): void {
        if ('type' in message && message.type === 'ready') {
            this.handleReady()
            return
        }
        this.handleDidReceiveMessage(message as any)
    }

    protected abstract handleDidReceiveMessage(message: WebviewMessageT): void

    protected async postMessage(
        message: ExtensionMessageT | BaseExtensionMessage
    ): Promise<boolean | undefined> {
        return await this.initDoer.do(() => this.panel.webview.postMessage(message))
    }
}

interface BotMessage {
    role: 'bot'
    text: string
}

interface UserMessage {
    role: 'user'
    text: string
}

type Interaction = [UserMessage, BotMessage | null]

export class MinionController extends ReactPanelController<
    MinionWebviewMessage,
    MinionExtensionMessage
> {
    private transcript: Interaction[] = []
    private actions: any[] = []

    private pendingResponseToken?: vscode.CancellationToken

    constructor(
        private anthropic: Anthropic,
        panel: vscode.WebviewPanel,
        assetRoot: vscode.Uri,
        onDidDisposePanel?: () => void
    ) {
        super(panel, assetRoot, onDidDisposePanel)
    }

    protected handleDidReceiveMessage(message: MinionWebviewMessage): void {
        console.log('# AgentController.handleDidReceiveMessage', message)
        switch (message.type) {
            case 'start':
                this.handleStart(message.description)
                return
        }
    }

    private async handleStart(description: string): Promise<void> {
        const text = `
I'd like help performing the following task:
<taskDescription>
${description}
</taskDescription>

First, restate the task in terms of the following format:
<existingBehavior>a detailed description of the existing behavior</existingBehavior>
<desiredBehavior>a detailed description of the new behavior</desiredBehavior>`.trimStart()
        this.transcript.push([
            {
                role: 'user',
                text,
            },
            null,
        ])
        // make llm request

        // NEXT: make LLM request and then proceed

        const messagePromise = this.anthropic.messages.create({
            max_tokens: 1024,
            messages: [{ role: 'user', content: 'Hello, Claude' }],
            // model: 'claude-3-opus-20240229',
            model: 'claude-3-haiku-20240307',
        })

        const message = await messagePromise
        console.log('######### got claude message', message)

        // post view transcript to view

        // on llm request completed, post bot message to transcript and log bot action
    }

    private postView(): void {
        // TODO: post action log to view, including state of pending responses
    }
}
