import * as uuid from 'uuid'
import type * as vscode from 'vscode'

import type { Model } from '@sourcegraph/cody-shared'

import type { ExtensionMessage, WebviewMessage } from '../../vscode/src/chat/protocol'

import type { Repo } from '../../vscode/src/context/repo-fetcher'
import { EventEmitter, defaultWebviewPanel } from './vscode-shim'

/** Utility class to manage a list of `AgentWebPanel` or "native" WebviewPanel instances. */
export class AgentWebviewPanels {
    public panels = new Map<string, AgentWebviewPanel>()
    // TODO: If we don't create AgentWebviewPanels when using native webviews, untangle nativePanels from this type.
    public readonly nativePanels = new Map<string, { didReceiveMessage: (message: any) => void }>()
    public add(panel: AgentWebviewPanel): void {
        this.panels.set(panel.panelID, panel)
    }
    public getPanelOrError(id: string): AgentWebviewPanel {
        const result = this.panels.get(id)
        if (!result) {
            throw new Error(`No panel with ID${id}`)
        }
        return result
    }
}

interface AttributionResult {
    attribution?: {
        repositoryNames: string[]
        limitHit: boolean
    }
    error?: string
}

/**
 * Custom implementation of vscode.WebviewPanel that makes it possible to
 * delegate the implementation to the remote JSON-RPC client via the custom
 * `receiveMessage` and `postMessage` event emitters.
 */
export class AgentWebviewPanel implements vscode.WebviewPanel {
    public panelID = uuid.v4()
    public chatID: string | undefined // also known as `sessionID` in some parts of the Cody codebase
    public models: Model[] | undefined
    public remoteRepos: Repo[] | undefined
    public isInitialized = false
    public isMessageInProgress: undefined | boolean
    // Event that fires whenever the `isMessageInProgress` value changes from the `type: 'transcript'` message.
    public messageInProgressChange = new EventEmitter<ExtensionMessage>()
    public readonly onMessageInProgressDidChange = this.messageInProgressChange.event
    public panel: vscode.WebviewPanel
    public receiveMessage = new EventEmitter<WebviewMessage>()
    public postMessage = new EventEmitter<ExtensionMessage>()
    public onDidPostMessage = this.postMessage.event
    private attributionResults = new Map<string, AttributionResult>()
    constructor(
        viewType: string,
        title: string,
        showOptions:
            | vscode.ViewColumn
            | { readonly viewColumn: vscode.ViewColumn; readonly preserveFocus?: boolean },
        options?: vscode.WebviewPanelOptions & vscode.WebviewOptions
    ) {
        this.panel = defaultWebviewPanel({
            viewType,
            title,
            showOptions,
            options,
            onDidReceiveMessage: this.receiveMessage,
            onDidPostMessage: this.postMessage,
        })
    }

    public initialize(): void {
        if (!this.isInitialized) {
            this.receiveMessage.fire({ command: 'ready' })
            this.receiveMessage.fire({ command: 'initialized' })
            this.isInitialized = true
        }
    }

    public get viewType(): string {
        return this.panel.viewType
    }

    public get title(): string {
        return this.panel.title
    }
    public set title(value) {
        this.panel.title = value
    }

    public get iconPath():
        | vscode.Uri
        | { readonly light: vscode.Uri; readonly dark: vscode.Uri }
        | undefined {
        return this.panel.iconPath
    }
    public set iconPath(value) {
        this.panel.iconPath = value
    }

    public popAttribution(snippet: string): AttributionResult {
        const attribution = this.attributionResults.get(snippet)
        this.attributionResults.delete(snippet)
        return attribution !== undefined ? attribution : { error: 'Attribution result lost' }
    }
    public pushAttribution(result: { snippet: string } & AttributionResult) {
        this.attributionResults.set(result.snippet, result)
    }

    public get visible(): boolean {
        return this.panel.visible
    }

    public get active(): boolean {
        return this.panel.active
    }

    public get webview(): vscode.Webview {
        return this.panel.webview
    }

    public get options(): vscode.WebviewPanelOptions {
        return this.panel.options
    }

    public get viewColumn(): vscode.ViewColumn | undefined {
        return this.panel.viewColumn
    }

    public get onDidDispose(): vscode.Event<void> {
        return this.panel.onDidDispose
    }

    public get onDidChangeViewState(): vscode.Event<vscode.WebviewPanelOnDidChangeViewStateEvent> {
        return this.panel.onDidChangeViewState
    }

    public reveal(): void {
        this.panel.reveal()
    }

    public dispose(): void {
        this.panel.dispose()
    }
}
