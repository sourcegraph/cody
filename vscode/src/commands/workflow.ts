import * as vscode from 'vscode'

export function registerWorkflowCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('cody.openWorkflowEditor', async () => {
            const panel = vscode.window.createWebviewPanel(
                'codyWorkflow',
                'Cody Workflow Editor',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
                }
            )

            const webviewPath = vscode.Uri.joinPath(context.extensionUri, 'dist')

            // Read the HTML file content
            const root = vscode.Uri.joinPath(webviewPath, 'workflow.html')
            const bytes = await vscode.workspace.fs.readFile(root)
            const decoded = new TextDecoder('utf-8').decode(bytes)
            const resources = panel.webview.asWebviewUri(webviewPath)

            // Replace variables in the HTML content
            panel.webview.html = decoded
                .replaceAll('./', `${resources.toString()}/`)
                .replaceAll('{cspSource}', panel.webview.cspSource)
        })
    )
}
