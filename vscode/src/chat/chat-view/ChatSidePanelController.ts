import type * as vscode from 'vscode'

export class ChatSidePanelController implements vscode.WebviewViewProvider {
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        const webview = webviewView.webview
        webview.html = '<div>hello world</div>'
    }
}

class ChatController {}
