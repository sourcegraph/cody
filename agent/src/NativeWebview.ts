import uuid from 'uuid'
import type * as vscode from 'vscode'

type NativeWebviewHandle = string

interface WebviewProtocolDelegate {
    setTitle(handle: NativeWebviewHandle, title: string): void
}

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
    // The identifier used to refer to the Webview on the client side. This
    // identifier is allocated by the Agent because createWebviewPanel is
    // synchronous.
    private handle: NativeWebviewHandle = `native-webview-${uuid.v4()}`
    private _title: string

    constructor(
        private readonly delegate: WebviewProtocolDelegate,
        public readonly viewType: string,
        title: string
    ) {
        this._title = title
    }

    public get title(): string {
        return this._title
    }

    public set title(value: string) {
        this.delegate.setTitle(this.handle, value)
        this._title = value
    }

    /**
     * Icon for the panel shown in UI.
     */
    iconPath?: Uri | { readonly light: Uri; readonly dark: Uri }

    /**
     * {@linkcode Webview} belonging to the panel.
     */
    readonly webview: Webview

    /**
     * Content settings for the webview panel.
     */
    readonly options: WebviewPanelOptions

    /**
     * Editor position of the panel. This property is only set if the webview is in
     * one of the editor view columns.
     */
    readonly viewColumn: ViewColumn | undefined

    /**
     * Whether the panel is active (focused by the user).
     */
    readonly active: boolean

    /**
     * Whether the panel is visible.
     */
    readonly visible: boolean

    /**
     * Fired when the panel's view state changes.
     */
    readonly onDidChangeViewState: Event<WebviewPanelOnDidChangeViewStateEvent>

    /**
     * Fired when the panel is disposed.
     *
     * This may be because the user closed the panel or because `.dispose()` was
     * called on it.
     *
     * Trying to use the panel after it has been disposed throws an exception.
     */
    readonly onDidDispose: Event<void>

    /**
     * Show the webview panel in a given column.
     *
     * A webview panel may only show in a single column at a time. If it is already showing, this
     * method moves it to a new column.
     *
     * @param viewColumn View column to show the panel in. Shows in the current `viewColumn` if undefined.
     * @param preserveFocus When `true`, the webview will not take focus.
     */
    reveal(viewColumn?: ViewColumn, preserveFocus?: boolean): void

    /**
     * Dispose of the webview panel.
     *
     * This closes the panel if it showing and disposes of the resources owned by the webview.
     * Webview panels are also disposed when the user closes the webview panel. Both cases
     * fire the `onDispose` event.
     */
    dispose(): any
}
