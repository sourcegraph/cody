import * as vscode from 'vscode'
import type {
    WorkflowFromExtension,
    WorkflowToExtension,
} from '../../webviews/workflow/services/WorkflowProtocol'

import { executeWorkflow } from './workflow-executor'
import { handleWorkflowLoad, handleWorkflowSave } from './workflow-io'

export function registerWorkflowCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('cody.openWorkflowEditor', async () => {
            const panel = vscode.window.createWebviewPanel(
                'codyWorkflow',
                'Cody Workflow Editor',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: false,
                    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
                }
            )

            // Add message handler
            panel.webview.onDidReceiveMessage(
                async (message: WorkflowToExtension) => {
                    switch (message.type) {
                        case 'save_workflow':
                            await handleWorkflowSave(message.data)
                            break
                        case 'load_workflow': {
                            const loadedData = await handleWorkflowLoad()
                            if (loadedData) {
                                panel.webview.postMessage({
                                    type: 'workflow_loaded',
                                    data: loadedData,
                                } as WorkflowFromExtension)
                            }
                            break
                        }
                        case 'execute_workflow': {
                            if (message.data?.nodes && message.data?.edges) {
                                await executeWorkflow(
                                    message.data.nodes,
                                    message.data.edges,
                                    panel.webview
                                )
                            }
                            break
                        }
                    }
                },
                undefined,
                context.subscriptions
            )

            // Add dispose handler
            panel.onDidDispose(() => {
                // Cleanup resources
                panel.dispose()
            })

            const webviewPath = vscode.Uri.joinPath(context.extensionUri, 'dist/webviews')

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
