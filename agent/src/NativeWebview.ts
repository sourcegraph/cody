import uuid from 'uuid'
import * as vscode from 'vscode'

type NativeWebviewHandle = string

// TODO: Add support for WebviewView

/**
 * A delegate for adapting the VSCode Webview, WebviewPanel and WebviewView API
 * to a client which has a native webview implementation.
 */
interface WebviewProtocolDelegate {
    // CSP, resource-related
    readonly webviewBundleLocalPrefix: string
    readonly webviewBundleServingPrefix: string
    readonly cspSource: string

    // WebviewPanel
    dispose(handle: NativeWebviewHandle): void
    reveal(handle: NativeWebviewHandle, viewColumn?: vscode.ViewColumn, preserveFocus?: boolean): void
    setTitle(handle: NativeWebviewHandle, title: string): void
    setIconPath(
        handle: NativeWebviewHandle,
        value: { light: vscode.Uri; dark: vscode.Uri } | undefined
    ): void

    // Webview
    setHtml(handle: NativeWebviewHandle, value: string): void
    postMessage(handle: NativeWebviewHandle, message: any): Promise<boolean>
}

class NativeWebview implements vscode.Webview {
    private readonly didReceiveMessageEmitter = new vscode.EventEmitter<vscode.Event<any>>()
    public readonly onDidReceiveMessage: vscode.Event<any> = this.didReceiveMessageEmitter.event
    private _html = ''

    constructor(
        private readonly delegate: WebviewProtocolDelegate,
        private readonly handle: NativeWebviewHandle,
        public readonly options: vscode.WebviewOptions
    ) {}

    public get html(): string {
        return this._html
    }

    public set html(value: string) {
        this.delegate.setHtml(this.handle, value)
        this._html = value
    }

    postMessage(message: any): Thenable<boolean> {
        return this.delegate.postMessage(this.handle, message)
    }

    asWebviewUri(localResource: vscode.Uri): vscode.Uri {
        if (!localResource.toString().startsWith(this.delegate.webviewBundleLocalPrefix)) {
            // TODO: If you encounter this error, elaborate the ClientCapabilities protocol for
            // cspRoot/webviewBundleServingPrefix to support multiple resource roots.
            throw new Error(
                `Unable to make '${localResource.toString()}' a webview URI: must start with '${
                    this.delegate.webviewBundleLocalPrefix
                }'`
            )
        }
        return vscode.Uri.parse(
            `${this.delegate.webviewBundleServingPrefix}${localResource.path.substr(
                this.delegate.webviewBundleLocalPrefix.length
            )}`
        )
    }

    public get cspSource(): string {
        return this.delegate.cspSource
    }
}

// TODO: Plumb the receiveMessage, etc. side out of this interface.

/**
 * Implementation of WebviewPanel that is supported by a native Webview
 * implementation on the client side and thunks a larger subset of the VSCode
 * WebView API to the client than AgentWebviewPanel does.
 *
 * Unlike AgentWebviewPanel, this does not contain Cody concepts like chat IDs,
 * models, etc. because those details are all delegated to the actual web
 * contents hosted by the client.
 */
export class NativeWebviewPanel implements vscode.WebviewPanel {
    // The identifier used to refer to the panel *and* Webview on the client
    // side. This identifier is allocated by the Agent because
    // createWebviewPanel is synchronous.
    private handle: NativeWebviewHandle = `native-webview-panel-${uuid.v4()}`
    private _title: string
    private _iconPath: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | undefined
    public readonly webview: vscode.Webview
    // TODO: Implement active, visible and this event.
    private readonly didChangeViewStateEmitter: vscode.EventEmitter<vscode.WebviewPanelOnDidChangeViewStateEvent> =
        new vscode.EventEmitter()
    public readonly onDidChangeViewState: vscode.Event<vscode.WebviewPanelOnDidChangeViewStateEvent> =
        this.didChangeViewStateEmitter.event
    private readonly disposeEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter()
    public readonly onDidDispose: vscode.Event<void> = this.disposeEmitter.event

    constructor(
        private readonly delegate: WebviewProtocolDelegate,
        public readonly viewType: string,
        title: string,
        public readonly options: vscode.WebviewPanelOptions,
        webviewOptions: vscode.WebviewOptions
    ) {
        this._title = title
        this.webview = new NativeWebview(this.delegate, this.handle, webviewOptions)
    }

    public get title(): string {
        return this._title
    }

    public set title(value: string) {
        this.delegate.setTitle(this.handle, value)
        this._title = value
    }

    public get iconPath(): vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | undefined {
        if (!this._iconPath) {
            return undefined
        }
        if (this._iconPath instanceof vscode.Uri) {
            return this._iconPath
        }
        return { ...this._iconPath }
    }

    public set iconPath(value: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | undefined) {
        this.delegate.setIconPath(
            this.handle,
            value instanceof vscode.Uri ? { light: value, dark: value } : value
        )
        this._iconPath = value
    }

    public get viewColumn(): vscode.ViewColumn | undefined {
        // TODO: Implement this
        throw new Error('Agent "native" webview does not support WebviewPanel.viewColumn')
    }

    public get active(): boolean {
        // TODO: Implement this
        throw new Error('Agent "native" webview does not support WebviewPanel.active')
    }

    public get visible(): boolean {
        // TODO: Implement this
        throw new Error('Agent "native" webview does not support WebviewPanel.visible')
    }

    reveal(viewColumn?: vscode.ViewColumn, preserveFocus?: boolean): void {
        this.delegate.reveal(this.handle, viewColumn, preserveFocus)
    }

    dispose(): any {
        this.delegate.dispose(this.handle)
    }
}
