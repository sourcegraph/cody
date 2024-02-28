import * as vscode from 'vscode'
import type { SymfRunner } from '../local-context/symf'

export class GuideProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private webview?: vscode.Webview

    constructor(
        private extensionUri: vscode.Uri,
        private symfRunner: SymfRunner
    ) {
        // TODO
        console.log('GuideProvider constructor', this.webview, this.symfRunner)
    }

    dispose() {
        throw new Error('Method not implemented.')
    }
    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): Promise<void> {
        this.webview = webviewView.webview
        const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')

        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [webviewPath],
        }

        // Create Webview using vscode/index.html
        const root = vscode.Uri.joinPath(webviewPath, 'guide.html')
        const bytes = await vscode.workspace.fs.readFile(root)
        const decoded = new TextDecoder('utf-8').decode(bytes)
        const resources = webviewView.webview.asWebviewUri(webviewPath)

        // Set HTML for webview
        // This replace variables from the vscode/dist/index.html with webview info
        // 1. Update URIs to load styles and scripts into webview (eg. path that starts with ./)
        // 2. Update URIs for content security policy to only allow specific scripts to be run
        webviewView.webview.html = decoded
            .replaceAll('./', `${resources.toString()}/`)
            .replaceAll('{cspSource}', webviewView.webview.cspSource)

        // Register to receive messages from webview
        this.disposables.push(
            webviewView.webview.onDidReceiveMessage(
                message => {
                    console.log('# got message', message)
                }
                // this.onDidReceiveMessage(
                //     hydrateAfterPostMessage(message, uri => vscode.Uri.from(uri as any))
                // )
            )
        )
    }
}
