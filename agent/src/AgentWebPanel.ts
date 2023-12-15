import * as uuid from 'uuid'
import * as vscode from 'vscode'

import { defaultWebviewPanel, EventEmitter } from './vscode-shim'

export class AgentWebPanels {
    public panels = new Map<string, AgentWebPanel>()
    public add(panel: AgentWebPanel): void {
        this.panels.set(panel.panelID, panel)
    }
}

export class AgentWebPanel implements vscode.WebviewPanel {
    public panelID = uuid.v4()
    public panel: vscode.WebviewPanel
    public receiveMessage = new EventEmitter<any>()
    public postMessage = new EventEmitter<any>()
    public onDidPostMessage = this.postMessage.event
    constructor(
        viewType: string,
        title: string,
        showOptions: vscode.ViewColumn | { readonly viewColumn: vscode.ViewColumn; readonly preserveFocus?: boolean },
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

    get viewType() {
        return this.panel.viewType
    }

    get title() {
        return this.panel.title
    }
    set title(value) {
        this.panel.title = value
    }

    get iconPath() {
        return this.panel.iconPath
    }
    set iconPath(value) {
        this.panel.iconPath = value
    }

    get visible() {
        return this.panel.visible
    }

    get active() {
        return this.panel.active
    }

    get webview() {
        return this.panel.webview
    }

    get options() {
        return this.panel.options
    }

    get viewColumn() {
        return this.panel.viewColumn
    }

    get onDidDispose() {
        return this.panel.onDidDispose
    }

    get onDidChangeViewState() {
        return this.panel.onDidChangeViewState
    }

    public reveal() {
        this.panel.reveal()
    }

    public dispose() {
        this.panel.dispose()
    }
}
