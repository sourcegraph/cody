import path from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import { hydrateAfterPostMessage } from '@sourcegraph/cody-shared'
import * as uuid from 'uuid'
import * as vscode from 'vscode'
import type {
    MinionExtensionMessage,
    MinionWebviewMessage,
} from '../../webviews/minion/webview_protocol'
import { InitDoer } from '../chat/chat-view/InitDoer'
import type { SymfRunner } from '../local-context/symf'
import type { Action, ActionStatus } from './action'
import { type Environment, LocalVSCodeEnvironment } from './environment'
import { RestateNode } from './nodes/restate'
import type { HumanLink, Memory } from './statemachine'
import { StateMachine } from './statemachine'

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

/**
 * A generic controller for a React webview panel that handles initialization. Should
 * be subclassed by an application-specific controller class.
 */
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
        }
        this.handleDidReceiveMessage(message)
    }

    protected abstract handleDidReceiveMessage(message: WebviewMessageT | BaseWebviewMessage): void

    protected async postMessage(
        message: ExtensionMessageT | BaseExtensionMessage
    ): Promise<boolean | undefined> {
        return await this.initDoer.do(() => this.panel.webview.postMessage(message))
    }
}

export class MinionController
    extends ReactPanelController<MinionWebviewMessage, MinionExtensionMessage>
    implements HumanLink
{
    private env: Environment
    private memory: Memory = {
        transcript: [],
        actions: [],
    }
    private nextAction: (Action & { status: ActionStatus }) | undefined = undefined
    private stateMachine: StateMachine | null = null

    // private pendingResponseToken?: vscode.CancellationToken

    constructor(
        symf: SymfRunner | undefined,
        private anthropic: Anthropic,
        panel: vscode.WebviewPanel,
        assetRoot: vscode.Uri,
        onDidDisposePanel?: () => void
    ) {
        super(panel, assetRoot, onDidDisposePanel)
        this.env = new LocalVSCodeEnvironment(
            vscode.workspace.workspaceFolders?.map(f => f.uri) || [],
            symf
        )
    }

    private askCallbacks: { [id: string]: (error?: string) => void } = {}

    //
    // Overrides for HumanLink interface
    //

    public ask(proposedAction: Action): Promise<void> {
        return new Promise((resolve, reject) => {
            this._sendAsk(proposedAction, error => {
                if (error === undefined) {
                    resolve()
                } else {
                    reject(error)
                }
            })
        })
    }

    private _sendAsk(action: Action, callback: (error?: string) => void): void {
        const id = uuid.v4()
        this.askCallbacks[id] = callback
        void this.postMessage({ type: 'propose-next-action', id, action })
    }

    public report(action: Action, status: Exclude<ActionStatus, 'pending'>, message: string): void {
        if (status === 'completed') {
            this.nextAction = undefined
            void this.postMessage({
                type: 'update-next-action',
                nextAction: null,
            })
        } else {
            this.nextAction = { ...action, status }
            void this.postMessage({
                type: 'update-next-action',
                nextAction: { action, status, message },
            })
        }
    }

    public handleUserActivity({
        savedTextDocument,
        newActiveEditor,
    }: { savedTextDocument?: vscode.TextDocument; newActiveEditor?: vscode.TextEditor }): void {
        console.log('# handleUserActivity', savedTextDocument, newActiveEditor)
        if (savedTextDocument) {
            const basename = path.basename(savedTextDocument.fileName)
            this.memory.actions.push({
                level: 1,
                type: 'human',
                actionType: 'edit',
                description: `Edited ${basename}`,
            })
        }
        if (newActiveEditor) {
            const basename = path.basename(newActiveEditor.document.fileName)
            this.memory.actions.push({
                level: 1,
                type: 'human',
                actionType: 'view',
                description: `Viewed ${basename}`,
            })
        }
        this.postUpdateActions()
    }

    protected handleDidReceiveMessage(message: MinionWebviewMessage | BaseWebviewMessage): void {
        console.log('# AgentController.handleDidReceiveMessage', message)
        switch (message.type) {
            case 'ready': {
                const workspaceFolderUris = (vscode.workspace.workspaceFolders || []).map(f =>
                    f.uri.toString()
                )
                this.postMessage({ type: 'config', workspaceFolderUris })
                break
            }
            case 'start': {
                void this.handleStart(message.description)
                break
            }
            case 'propose-next-action-reply': {
                if (!(message.id in this.askCallbacks)) {
                    this.postMessage({
                        type: 'display-error',
                        error: `Received answer corresponding to nonexistent or previously proposed action ${JSON.stringify(
                            message.action
                        )}.`,
                    })
                } else {
                    this.askCallbacks[message.id](message.error)
                }
                delete this.askCallbacks[message.id]
                break
            }
        }
    }

    private async handleStart(description: string): Promise<void> {
        // Harcoded: start with restating the problem in a more structured format
        this.stateMachine = new StateMachine(new RestateNode(description))

        // TODO(beyang): post view state to indicate loading/in-progress state, support cancellation
        let done = false
        while (!done) {
            done = await this.stateMachine.step(this, this.env, this.memory, this.anthropic)
            this.postUpdateActions()
            const shouldStep = await this.waitForStep()
            if (!shouldStep) {
                // cancelled
                console.error('TODO(beyang): handle cancellation')
                break
            }
        }

        // on llm request completed, post bot message to transcript and log bot action
    }

    private async waitForStep(): Promise<boolean> {
        // NEXT: implement this functionality on the view side (will need to remember an ID, to correlate the
        // response to the request)
        return true
    }

    private postUpdateActions(): void {
        this.postMessage({
            type: 'update-actions',
            actions: this.memory.actions,
            // nextAction: this.memory.
        })
    }
}
