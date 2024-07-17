import * as uuid from 'uuid'
import * as vscode from 'vscode'
import type { Agent } from './agent'
import type { DefiniteWebviewOptions } from './protocol-alias'
import * as vscode_shim from './vscode-shim'

export type NativeWebviewCapabilities = { cspSource: string; webviewBundleServingPrefix: string }

type NativeWebviewHandle = string

/**
 * A delegate for adapting the VSCode Webview, WebviewPanel and WebviewView API
 * to a client which has a native webview implementation.
 */
interface WebviewProtocolDelegate {
    // CSP, resource-related
    readonly webviewBundleLocalPrefix: vscode.Uri
    readonly webviewBundleServingPrefix: string
    readonly cspSource: string

    // WebviewPanel
    createWebviewPanel(
        handle: NativeWebviewHandle,
        viewType: string,
        title: string,
        showOptions: { preserveFocus: boolean; viewColumn: vscode.ViewColumn },
        options: DefiniteWebviewOptions
    ): void

    // Used by both panels and views.

    // Registers the sink for client -> host postMessage events.
    registerWebview(
        handle: NativeWebviewHandle,
        postMessageSink: {
            didReceiveMessage: (message: any) => void
        }
    ): void
    setTitle(handle: NativeWebviewHandle, title: string): void

    // For panels.
    dispose(handle: NativeWebviewHandle): void
    reveal(handle: NativeWebviewHandle, viewColumn?: vscode.ViewColumn, preserveFocus?: boolean): void
    setIconPath(
        handle: NativeWebviewHandle,
        value: { light: vscode.Uri; dark: vscode.Uri } | undefined
    ): void

    // For views.
    setDescription(viewId: string, description: string | undefined): void
    // TODO: Is there another API to show views, can we simply use that?
    show(viewId: string, preserveFocus?: boolean): void

    // Webview
    setHtml(handle: NativeWebviewHandle, value: string): void
    setOptions(handle: NativeWebviewHandle, value: DefiniteWebviewOptions): void
    postMessage(handle: NativeWebviewHandle, message: any): Promise<boolean>
}

let webviewProtocolDelegate: WebviewProtocolDelegate | undefined = undefined

export function resolveWebviewView(
    provider: vscode.WebviewViewProvider,
    viewId: string,
    webviewHandle: string
): void | Thenable<void> {
    if (!webviewProtocolDelegate) {
        return undefined
    }
    const view = new NativeWebviewView(viewId, webviewHandle, webviewProtocolDelegate)
    // TODO: Wire up context (setState, etc.) here
    webviewProtocolDelegate!.registerWebview(webviewHandle, {
        didReceiveMessage(message: any) {
            ;(view.webview as NativeWebview).didReceiveMessageEmitter.fire(message)
        },
    })
    return provider.resolveWebviewView(
        view,
        { state: undefined },
        new vscode.CancellationTokenSource().token
    )
}

export function registerNativeWebviewHandlers(
    agent: Agent,
    extensionUri: vscode.Uri,
    capabilities: NativeWebviewCapabilities
): void {
    webviewProtocolDelegate = {
        // TODO: When we want to serve resources outside dist/, make Agent
        // include 'dist' in its bundle paths, and simply set this to
        // extensionUri.
        webviewBundleLocalPrefix: extensionUri.with({ path: `${extensionUri.path}/dist` }),
        webviewBundleServingPrefix: capabilities.webviewBundleServingPrefix,
        cspSource: capabilities.cspSource,
        createWebviewPanel: (handle, viewType, title, showOptions, options) => {
            agent.notify('webview/createWebviewPanel', {
                handle,
                viewType,
                title,
                showOptions,
                options,
            })
        },
        dispose: handle => {
            agent.notify('webview/dispose', {
                handle,
            })
        },
        show: (viewId, preserveFocus) => {
            // TODO: implement show
        },
        reveal: (handle, viewColumn, preserveFocus) => {
            agent.notify('webview/reveal', {
                handle,
                viewColumn: viewColumn ?? vscode.ViewColumn.Active,
                preserveFocus: preserveFocus ?? false,
            })
        },
        setTitle: (handle, title) => {
            agent.notify('webview/setTitle', {
                handle,
                title,
            })
        },
        setDescription: (viewId, description) => {
            // TODO: implement setDescription
        },
        setIconPath: (handle, iconPath) => {
            agent.notify('webview/setIconPath', {
                handle,
                iconPathUri: iconPath?.toString(),
            })
        },
        setOptions: (handle, options) => {
            agent.notify('webview/setOptions', {
                handle,
                options,
            })
        },
        setHtml: (handle, html) => {
            agent.notify('webview/setHtml', {
                handle,
                html,
            })
        },
        postMessage: (handle, message) => {
            agent.notify('webview/postMessageStringEncoded', {
                id: handle,
                stringEncodedMessage: JSON.stringify(message),
            })
            return Promise.resolve(true)
        },
        registerWebview: (handle, postMessageSink) => {
            agent.webPanels.nativePanels.set(handle, postMessageSink)
        },
    }
    vscode_shim.setCreateWebviewPanel((viewType, title, showOptions, options) => {
        const panel = new NativeWebviewPanel(
            webviewProtocolDelegate!,
            viewType,
            title,
            {
                retainContextWhenHidden: options?.retainContextWhenHidden ?? false,
                enableFindWidget: options?.enableFindWidget ?? false,
            },
            {
                enableScripts: options?.enableScripts ?? false,
                enableCommandUris: options?.enableCommandUris ?? false,
                localResourceRoots: [webviewProtocolDelegate!.webviewBundleLocalPrefix],
            }
        )
        if (typeof showOptions === 'number') {
            showOptions = {
                viewColumn: showOptions,
            }
        }
        webviewProtocolDelegate!.createWebviewPanel(
            panel.handle,
            viewType,
            title,
            {
                preserveFocus: showOptions?.preserveFocus ?? false,
                viewColumn: showOptions?.viewColumn ?? vscode.ViewColumn.Active,
            },
            {
                enableScripts: panel.webview.options.enableScripts ?? false,
                enableForms:
                    panel.webview.options.enableForms ?? panel.webview.options.enableScripts ?? false,
                enableCommandUris: panel.webview.options.enableCommandUris ?? false,
                localResourceRoots: (panel.webview.options.localResourceRoots || []).map(uri =>
                    uri.toString()
                ),
                portMapping: panel.webview.options.portMapping ?? [],
                enableFindWidget: panel.options.enableFindWidget ?? false,
                retainContextWhenHidden: panel.options.retainContextWhenHidden ?? false,
            }
        )
        webviewProtocolDelegate!.registerWebview(panel.handle, {
            didReceiveMessage(message: any) {
                ;(panel.webview as NativeWebview).didReceiveMessageEmitter.fire(message)
            },
        })
        return panel
    })
}

// TODO: Add support for WebviewView

class NativeWebview implements vscode.Webview {
    readonly didReceiveMessageEmitter = new vscode.EventEmitter<vscode.Event<any>>()
    public readonly onDidReceiveMessage: vscode.Event<any> = this.didReceiveMessageEmitter.event
    private _html = ''

    constructor(
        private readonly delegate: WebviewProtocolDelegate,
        private readonly handle: NativeWebviewHandle,
        private _options: vscode.WebviewOptions
    ) {}

    public get html(): string {
        return this._html
    }

    public set html(value: string) {
        this.delegate.setHtml(this.handle, value)
        this._html = value
    }

    public get options(): vscode.WebviewOptions {
        return this._options
    }

    public set options(value: vscode.WebviewOptions) {
        const options = {
            // TODO: Support enableFindWidget
            enableFindWidget: false,
            // TODO: Support retainContextWhenHidden
            retainContextWhenHidden: true,
            enableScripts: value.enableScripts ?? false,
            enableCommandUris: value.enableCommandUris ?? false,
            enableForms: value.enableForms ?? false,
            localResourceRoots: value.localResourceRoots ?? [],
            portMapping: value.portMapping || [],
        }
        this.delegate.setOptions(this.handle, {
            ...options,
            localResourceRoots: options.localResourceRoots.map(uri => uri.toString()),
        })
        this._options = options
    }

    postMessage(message: any): Thenable<boolean> {
        return this.delegate.postMessage(this.handle, message)
    }

    asWebviewUri(localResource: vscode.Uri): vscode.Uri {
        if (!localResource.toString().startsWith(this.delegate.webviewBundleLocalPrefix.toString())) {
            // TODO: If you encounter this error, elaborate the ClientCapabilities protocol for
            // cspRoot/webviewBundleServingPrefix to support multiple resource roots.
            throw new Error(
                `Unable to make '${localResource.toString()}' a webview URI: must start with '${this.delegate.webviewBundleLocalPrefix.toString()}'`
            )
        }
        return vscode.Uri.parse(
            `${this.delegate.webviewBundleServingPrefix}${localResource
                .toString()
                .slice(this.delegate.webviewBundleLocalPrefix.toString().length)}`
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
class NativeWebviewPanel implements vscode.WebviewPanel {
    // The identifier used to refer to the panel *and* Webview on the client
    // side. This identifier is allocated by the Agent because
    // createWebviewPanel is synchronous.
    public readonly handle: NativeWebviewHandle = `native-webview-panel-${uuid.v4()}`
    private _iconPath: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | undefined
    public readonly webview: vscode.Webview
    // TODO: Implement active, visible and this event.
    private readonly didChangeViewStateEmitter: vscode.EventEmitter<vscode.WebviewPanelOnDidChangeViewStateEvent> =
        new vscode.EventEmitter()
    public readonly onDidChangeViewState: vscode.Event<vscode.WebviewPanelOnDidChangeViewStateEvent> =
        this.didChangeViewStateEmitter.event
    private readonly disposeEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter()
    public readonly onDidDispose: vscode.Event<void> = this.disposeEmitter.event

    // TODO: Actually implement these properties.
    private readonly _viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active
    private readonly _active: boolean = true
    private readonly _visible: boolean = true

    // TODO: Consider passing an initial value of 'active' based on preserveFocus
    constructor(
        private readonly delegate: WebviewProtocolDelegate,
        public readonly viewType: string,
        private _title: string,
        public readonly options: vscode.WebviewPanelOptions,
        webviewOptions: vscode.WebviewOptions
    ) {
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
        console.warn('Agent "native" webview does not support WebviewPanel.viewColumn')
        return this._viewColumn
    }

    public get active(): boolean {
        // TODO: Implement this
        console.warn('Agent "native" webview does not support WebviewPanel.active')
        return this._active
    }

    public get visible(): boolean {
        console.warn('Agent "native" webview does not support WebviewPanel.visible')
        return this._visible
    }

    reveal(viewColumn?: vscode.ViewColumn, preserveFocus?: boolean): void {
        this.delegate.reveal(this.handle, viewColumn, preserveFocus)
    }

    dispose(): any {
        this.delegate.dispose(this.handle)
    }
}

/**
 * Implementation of WebviewView that is supported by a native Webview
 * implementation on the client side.
 */
class NativeWebviewView implements vscode.WebviewView {
    public readonly webview: vscode.Webview

    // TODO: Implement active, visible and this event.
    private readonly didChangeVisibility: vscode.EventEmitter<void> = new vscode.EventEmitter()
    public readonly onDidChangeVisibility: vscode.Event<void> = this.didChangeVisibility.event
    private readonly disposeEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter()
    public readonly onDidDispose: vscode.Event<void> = this.disposeEmitter.event

    // TODO: Actually implement these properties.
    public badge?: vscode.ViewBadge | undefined
    private readonly _visible: boolean = true
    // TODO: Is there an initial description in package.json
    private _description?: string
    // TODO: The initial title should be from package.json; how do we read that?
    private _title?: string

    constructor(
        public readonly viewType: string,
        private readonly handle: string,
        private readonly delegate: WebviewProtocolDelegate
    ) {
        const webviewOptions = {}
        this.webview = new NativeWebview(this.delegate, handle, webviewOptions)
    }

    public show(preserveFocus?: boolean) {
        this.delegate.show(this.viewType, !!preserveFocus)
    }

    public get title(): string | undefined {
        return this._title
    }

    public set title(value: string | undefined) {
        // TODO: Get the default title from package.json
        this.delegate.setTitle(this.handle, value || '')
        this._title = value
    }

    public get description(): string | undefined {
        return this._description
    }

    public set description(value: string | undefined) {
        this.delegate.setDescription(this.viewType, value)
        this._description = value
    }

    public get visible(): boolean {
        console.warn('Agent "native" webview does not support WebviewView.visible')
        return this._visible
    }
}
