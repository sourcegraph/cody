import type Anthropic from '@anthropic-ai/sdk'
import { hydrateAfterPostMessage } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type {
    MinionExtensionMessage,
    MinionWebviewMessage,
} from '../../webviews/minion/webview_protocol'
import { InitDoer } from '../chat/chat-view/InitDoer'
import type { SymfRunner } from '../local-context/symf'
import { authProvider } from '../services/AuthProvider'
import { MinionStorage } from './MinionStorage'
import { PlanController } from './PlanController'
import type { Event, MinionSession, MinionTranscriptBlock, MinionTranscriptItem } from './action'
import { ContextualizeBlock } from './blocks/contextualize'
import { PlanBlock } from './blocks/plan'
import { RestateBlock } from './blocks/restate'
import { type Environment, LocalVSCodeEnvironment } from './environment'
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
        ctor: () => T,
        panel: vscode.WebviewPanel
    ): Promise<T> {
        const agentManager = ctor()
        await agentManager.setPanel(panel)
        return agentManager
    }

    private disposables: vscode.Disposable[] = []
    private panel: vscode.WebviewPanel | undefined

    constructor(
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
    private async setPanel(panel: vscode.WebviewPanel): Promise<void> {
        if (this.panel) {
            throw new Error('Panel already set')
        }
        this.panel = panel

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
        this.disposables.push(
            this.panel.onDidDispose(() => {
                this.dispose()
                this.panel?.dispose()
                this.panel = undefined
                if (this.onDidDisposePanel) {
                    this.onDidDisposePanel()
                }
            }),

            // Let the webview know if it is active
            this.panel.onDidChangeViewState(event =>
                this.postMessage({
                    type: 'webview-state',
                    isActive: event.webviewPanel.active,
                })
            ),

            this.panel.webview.onDidReceiveMessage(message => {
                this._handleDidReceiveMessage(
                    hydrateAfterPostMessage(message, uri => vscode.Uri.from(uri as any))
                )
            })
        )
    }

    // do not override
    private _handleReady(): void {
        this.initDoer.signalInitialized()
    }

    // do not override
    private _handleDidReceiveMessage(message: WebviewMessageT | BaseWebviewMessage): void {
        if ('type' in message && message.type === 'ready') {
            this._handleReady()
        }
        this.handleDidReceiveMessage(message)
    }

    protected abstract handleDidReceiveMessage(message: WebviewMessageT | BaseWebviewMessage): void

    protected async postMessage(
        message: ExtensionMessageT | BaseExtensionMessage
    ): Promise<boolean | undefined> {
        return await this.initDoer.do(() => {
            return this.panel?.webview.postMessage(message)
        })
    }
}

export class MinionController extends ReactPanelController<
    MinionWebviewMessage,
    MinionExtensionMessage
> {
    private storage = new MinionStorage()

    //
    // Session state
    //

    private sessionState?: {
        session: MinionSession
        env: Environment
        stateMachine: StateMachine

        // if defined, the session is already running
        canceller?: vscode.CancellationTokenSource
    }

    private planControllers: { [blockid: string]: PlanController } = {}

    //
    // Callbacks
    //

    constructor(
        private symf: SymfRunner | undefined,
        private anthropic: Anthropic,
        assetRoot: vscode.Uri,
        onDidDisposePanel?: () => void
    ) {
        super(assetRoot, onDidDisposePanel)
    }

    public dispose(): void {
        if (this.sessionState) {
            this.sessionState.canceller?.cancel()
            this.sessionState.canceller?.dispose()
            this.sessionState = undefined
        }
        for (const controller of Object.values(this.planControllers)) {
            controller.dispose()
        }
        this.planControllers = {}
        super.dispose()
    }

    get events(): Event[] {
        return (
            this.sessionState?.session.transcript.flatMap(item =>
                item.type === 'event' ? [item.event] : []
            ) ?? []
        )
    }

    public handleUserActivity(_args: {
        savedTextDocument?: vscode.TextDocument
        newActiveEditor?: vscode.TextEditor
    }): void {
        // if (!this.sessionState) {
        //     // throw new Error('session not initialized')
        //     return
        // }
        // if (savedTextDocument) {
        //     const basename = path.basename(savedTextDocument.fileName)
        //     this.sessionState.session.transcript.push({
        //         type: 'action',
        //         action: {
        //             level: 1,
        //             type: 'human',
        //             actionType: 'edit',
        //             description: `Edited ${basename}`,
        //         },
        //     })
        // }
        // if (newActiveEditor) {
        //     const basename = path.basename(newActiveEditor.document.fileName)
        //     this.sessionState.session.transcript.push({
        //         type: 'action',
        //         action: {
        //             level: 1,
        //             type: 'human',
        //             actionType: 'view',
        //             description: `Viewed ${basename}`,
        //         },
        //     })
        // }
        // this.postUpdateTranscript()
    }

    protected handleDidReceiveMessage(message: MinionWebviewMessage | BaseWebviewMessage): void {
        switch (message.type) {
            case 'ready': {
                void this.handleReady()
                break
            }
            case 'start': {
                void this.handleStart(message.description)
                break
            }
            case 'set-session': {
                void this.handleSetSession(message.id)
                break
            }
            case 'clear-history': {
                void this.handleClearHistory()
                break
            }
            case 'replay-from-index': {
                void this.handleReplayFromIndex(message.index, true)
                break
            }
            case 'cancel-current-block': {
                void this.handleCancelCurrentBlock()
                break
            }
            case 'update-plan-step': {
                void this.handleUpdatePlanStep(message)
                break
            }
        }
    }

    private async handleReady(): Promise<void> {
        const workspaceFolderUris = (vscode.workspace.workspaceFolders || []).map(f => f.uri.toString())
        this.postMessage({
            type: 'config',
            workspaceFolderUris,
        })
        await this.postUpdateSessionIds()
    }

    private async handleStart(description: string): Promise<void> {
        this.loadSession({
            id: new Date().toISOString(),
            transcript: [
                {
                    type: 'event',
                    event: {
                        level: 0,
                        type: 'describe',
                        description,
                    },
                },
            ],
        })
        void this.runSession()
    }

    // Cancels existing session (if it exists), and starts a new one.
    // This method must NOT be async to avoid race conditions and when it
    // returns, all instance state should be updated.
    //
    // If startBlock is defined, then initializes the new state machine
    // to start at the specified block. If checkpoint is defined, restores
    // the checkpoint to the session state.
    //
    // This does not update the view state. The caller should call
    // this.postUpdateTranscript() after this method returns if the view
    // should be updated.
    private loadSession(
        newSession: MinionSession,
        startBlock?: { blockid: string; nodeid: string }
    ): void {
        if (this.sessionState) {
            const old = this.sessionState
            this.sessionState = undefined
            old.canceller?.cancel()
            old.canceller?.dispose()
        }

        const newCanceller = new vscode.CancellationTokenSource()
        const newStateMachine = makeDefaultStateMachine(newCanceller.token)
        if (startBlock) {
            const newStartBlock = newStateMachine.createBlock(startBlock.nodeid)
            newStartBlock.id = startBlock.blockid
            newStateMachine.currentBlock = { nodeid: startBlock.nodeid, block: newStartBlock }
        }
        this.sessionState = {
            env: new LocalVSCodeEnvironment(
                vscode.workspace.workspaceFolders?.map(f => f.uri) || [],
                this.symf
            ),
            stateMachine: newStateMachine,
            session: newSession,
        }
        this.syncPlanControllersToTranscript()
    }

    // Runs the current session.
    private async runSession(): Promise<void> {
        const mySession = this.sessionState
        if (!mySession) {
            throw new Error('no current session')
        }
        if (mySession.canceller) {
            throw new Error('session already running')
        }
        mySession.canceller = new vscode.CancellationTokenSource()
        const { env, stateMachine, canceller, session } = mySession
        const cancelToken = canceller.token

        let done = false
        while (!done) {
            const currentBlock = stateMachine.currentBlock
            const newBlock: MinionTranscriptItem = {
                type: 'block',
                status: 'doing',
                block: { nodeid: currentBlock.nodeid, blockid: currentBlock.block.id },
            }
            session.transcript.push(newBlock)
            this.postUpdateTranscript()

            // TODO(beyang): block interactions with env and human if cancelled
            done = await stateMachine.step(
                env,
                {
                    getEvents: () => this.events,
                    postEvent: (event: Event) => {
                        if (cancelToken.isCancellationRequested) {
                            // block posting events after cancellation
                            return
                        }
                        session.transcript.push({ type: 'event', event })
                        this.syncPlanControllersToTranscript()
                        this.postUpdateTranscript()
                    },
                },
                this.anthropic
            )
            if (cancelToken.isCancellationRequested) {
                return
            }

            newBlock.status = 'done'
            this.syncPlanControllersToTranscript()
            this.postUpdateTranscript()

            if (cancelToken.isCancellationRequested) {
                return
            }
            this.postUpdateTranscript()
        }
    }

    private async handleSetSession(id: string): Promise<void> {
        const storedSessionState = await this.storage.load(authProvider.instance!.getAuthStatus(), id)
        if (!storedSessionState) {
            throw new Error(`session not found with id: ${id}`)
        }
        const { session } = storedSessionState

        const { subTranscript, lastBlock } = MinionController.transcriptUntilLastBlock(
            session.transcript
        )
        this.loadSession({ id: session.id, transcript: subTranscript }, lastBlock?.block)
        if (lastBlock?.status === 'doing') {
            this.replayFromIndex(subTranscript.length - 1, false)
        }
        this.postUpdateTranscript()
        this.postUpdateSessionIds()
    }

    private async handleClearHistory(): Promise<void> {
        await this.storage.clear(authProvider.instance!.getAuthStatus())
        if (this.sessionState) {
            await this.save()
        }
        await this.postUpdateSessionIds()
    }

    private async handleReplayFromIndex(index: number, clearCheckpoint: boolean): Promise<void> {
        await this.replayFromIndex(index, clearCheckpoint)
    }

    private async replayFromIndex(index: number, clearCheckpoint: boolean): Promise<void> {
        if (!this.sessionState) {
            throw new Error('session not initialized')
        }
        if (index < 0 || index >= this.sessionState.session.transcript.length) {
            throw new Error('invalid index')
        }
        const lastItem = this.sessionState.session.transcript.at(index)
        if (lastItem?.type !== 'block') {
            throw new Error('index is not a block')
        }
        const lastBlock: MinionTranscriptBlock = lastItem
        await this.save() // save old session

        const newSession = {
            id: new Date().toISOString(), // create new logical session
            transcript: [...this.sessionState.session.transcript.slice(0, index)],
        }
        this.loadSession(newSession, lastBlock.block)
        void this.runSession()
        await this.save() // save new session
    }

    private static transcriptUntilLastBlock(transcript: MinionTranscriptItem[]): {
        subTranscript: MinionTranscriptItem[]
        lastBlock?: MinionTranscriptBlock
    } {
        for (let i = transcript.length - 1; i >= 0; i--) {
            const block = transcript[i]
            if (block.type === 'block') {
                return {
                    subTranscript: transcript.slice(0, i + 1),
                    lastBlock: block,
                }
            }
        }
        return { subTranscript: [] }
    }

    private async handleCancelCurrentBlock(): Promise<void> {
        if (!this.sessionState) {
            throw new Error('session not initialized')
        }

        if (this.sessionState.canceller?.token.isCancellationRequested) {
            // already cancelled
            return
        }

        this.sessionState.canceller?.cancel()

        const { subTranscript, lastBlock } = MinionController.transcriptUntilLastBlock(
            this.sessionState.session.transcript
        )
        if (!lastBlock) {
            throw new Error('no block to cancel')
        }

        this.sessionState.session.transcript = subTranscript
        lastBlock.status = 'cancelled'

        void this.save()
        this.postUpdateTranscript()
    }

    private handleUpdatePlanStep(message: MinionWebviewMessage & { type: 'update-plan-step' }): void {
        for (const [bid, planController] of Object.entries(this.planControllers)) {
            if (bid === message.blockid) {
                planController.handleDidReceiveMessage(message)
                return
            }
        }
    }

    private async save(): Promise<void> {
        if (!this.sessionState) {
            throw new Error('no session to save')
        }
        await this.storage.save(authProvider.instance!.getAuthStatus(), {
            session: this.sessionState.session,
        })
    }

    // TODO(beyang): rename to something that reflects syncing all state
    private postUpdateTranscript(): void {
        if (!this.sessionState) {
            throw new Error('session not initialized')
        }
        void this.save()
        this.postMessage({
            type: 'update-transcript',
            transcript: this.sessionState.session.transcript,
        })
        void this.postUpdateSessionIds()
    }

    private syncPlanControllersToTranscript(): void {
        if (!this.sessionState) {
            return
        }

        // Add new PlanController instances
        const seenBlockids = new Set<string>()
        for (const item of this.sessionState.session.transcript) {
            if (item.type !== 'event' || item.event.type !== 'plan') {
                continue
            }
            const planEvent = item.event
            seenBlockids.add(planEvent.blockid)
            if (!this.planControllers[planEvent.blockid]) {
                this.planControllers[planEvent.blockid] = new PlanController(
                    planEvent.blockid,
                    planEvent.steps,
                    {
                        getEvents: () => this.events,
                        postEvent: (event: Event) => {
                            throw new Error('not implemented')
                        },
                    },
                    this.sessionState.env,
                    this.anthropic,
                    {
                        postMessage: (message: MinionExtensionMessage): Promise<boolean | undefined> => {
                            return this.postMessage(message)
                        },
                    }
                )
            }
        }

        // Remove old PlanController instances
        for (const [blockid, controller] of Object.entries(this.planControllers)) {
            if (!seenBlockids.has(blockid)) {
                controller.dispose()
                delete this.planControllers[blockid]
            }
        }
    }

    private async postUpdateSessionIds(): Promise<void> {
        this.postMessage({
            type: 'update-session-ids',
            sessionIds: await this.storage.listIds(authProvider.instance!.getAuthStatus()),
            currentSessionId: this.sessionState?.session.id,
        })
    }
}

function makeDefaultStateMachine(cancellationToken: vscode.CancellationToken): StateMachine {
    return new StateMachine(
        cancellationToken,
        {
            nodes: {
                restate: () => RestateBlock,
                contextualize: () => ContextualizeBlock,
                plan: () => new PlanBlock(),
            },
            edges: {
                restate: 'contextualize',
                contextualize: 'plan',
                plan: null,
            },
        },
        { nodeid: 'restate', block: RestateBlock }
    )
}
