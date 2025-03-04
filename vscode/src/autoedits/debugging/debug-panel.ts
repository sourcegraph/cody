import * as vscode from 'vscode'

import { manipulateWebviewHTML } from '../../chat/chat-view/ChatController'
import type { AutoeditDebugMessageFromExtension } from './debug-protocol'

import { autoeditDebugStore } from './debug-store'

/**
 * A panel that displays debug information about auto-edit requests.
 */
export class AutoeditDebugPanel {
    public static currentPanel: AutoeditDebugPanel | undefined
    private static readonly viewType = 'codyAutoeditDebug'

    private readonly panel: vscode.WebviewPanel
    private readonly extensionContext: vscode.ExtensionContext
    private disposables: vscode.Disposable[] = []
    private updatePending = false
    private readonly throttleMs = 500 // Throttle updates to at most once per 500ms

    private constructor(panel: vscode.WebviewPanel, extensionContext: vscode.ExtensionContext) {
        this.panel = panel
        this.extensionContext = extensionContext

        // Set the webview's initial content
        void this.updateContent()

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables)

        // Subscribe to store changes with throttling
        this.disposables.push(
            autoeditDebugStore.onDidChange(() => {
                // If an update is already pending, don't schedule another one
                if (!this.updatePending) {
                    this.updatePending = true
                    setTimeout(() => {
                        this.updatePending = false
                        void this.updateContent()
                    }, this.throttleMs)
                }
            })
        )

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                if (message.type === 'ready') {
                    // Send the initial data when the webview is ready
                    void this.updateContent()
                }
            },
            null,
            this.disposables
        )
    }

    /**
     * Type-safe wrapper for sending messages to the webview.
     * Ensures that only valid messages defined in the protocol are sent.
     */
    private postMessageToWebview(message: AutoeditDebugMessageFromExtension): void {
        this.panel.webview.postMessage(message)
    }

    /**
     * Shows the debug panel in the editor.
     * If the panel already exists, it will be revealed.
     */
    public static showPanel(extensionContext: vscode.ExtensionContext): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined

        // If we already have a panel, show it
        if (AutoeditDebugPanel.currentPanel) {
            AutoeditDebugPanel.currentPanel.panel.reveal(column)
            return
        }

        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            AutoeditDebugPanel.viewType,
            'Cody Auto-Edits Debug',
            column || vscode.ViewColumn.One,
            {
                // Enable JavaScript in the webview
                enableScripts: true,
                // Restrict the webview to only load resources from the extension's directory
                localResourceRoots: [vscode.Uri.joinPath(extensionContext.extensionUri, 'dist')],
            }
        )

        AutoeditDebugPanel.currentPanel = new AutoeditDebugPanel(panel, extensionContext)
    }

    /**
     * Updates the content of the panel with the latest auto-edit requests.
     */
    private async updateContent(): Promise<void> {
        const entries = autoeditDebugStore.getAutoeditRequestDebugStates()

        // Send the updated entries to the webview using the type-safe protocol
        this.postMessageToWebview({
            type: 'updateEntries',
            entries,
        })

        // If no HTML content is set yet, set the initial HTML
        if (!this.panel.webview.html) {
            this.panel.webview.html = await this.getHtmlForWebview(this.panel.webview)
        }
    }

    /**
     * Generates the HTML for the webview panel, including the React app.
     */
    private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        // Read the compiled HTML file using VS Code's file system API
        try {
            const htmlPath = vscode.Uri.joinPath(
                this.extensionContext.extensionUri,
                'dist',
                'webviews',
                'autoedit-debug.html'
            )
            const htmlBytes = await vscode.workspace.fs.readFile(htmlPath)
            const htmlContent = new TextDecoder('utf-8').decode(htmlBytes)

            // Create URI for the webview resources
            const webviewResourcesUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionContext.extensionUri, 'dist', 'webviews')
            )

            // Use the shared manipulateWebviewHTML function
            return manipulateWebviewHTML(htmlContent, {
                cspSource: webview.cspSource,
                resources: webviewResourcesUri,
            })
        } catch (error) {
            console.error('Error getting HTML for webview:', error)
            return ''
        }
    }

    /**
     * Dispose of the panel when it's closed.
     */
    public dispose(): void {
        AutoeditDebugPanel.currentPanel = undefined

        // Clean up our resources
        this.panel.dispose()

        while (this.disposables.length) {
            const disposable = this.disposables.pop()
            if (disposable) {
                disposable.dispose()
            }
        }
    }
}
