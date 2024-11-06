import * as vscode from 'vscode'
import { writeToCodyJSON } from '../commands/utils/config-file'

/**
 * Handles the workflow saving process by displaying a save dialog to the user, allowing them to select a location to save the workflow file.
 *
 * @param data - The workflow data to be saved.
 * @returns A Promise that resolves when the workflow file has been successfully saved, or rejects if an error occurs.
 */
export async function handleWorkflowSave(data: any): Promise<void> {
    const workspaceRootFsPath = vscode.workspace.workspaceFolders?.[0]?.uri?.path
    const defaultFilePath = workspaceRootFsPath
        ? vscode.Uri.joinPath(
              vscode.Uri.file(workspaceRootFsPath),
              '.cody',
              'workflows',
              'workflow.json'
          )
        : vscode.Uri.file('workflow.json')
    const result = await vscode.window.showSaveDialog({
        defaultUri: defaultFilePath,
        filters: {
            'Workflow Files': ['json'],
        },
        title: 'Save Workflow',
    })
    if (result) {
        try {
            await writeToCodyJSON(result, data)
            void vscode.window.showInformationMessage('Workflow saved successfully!')
        } catch (error) {
            void vscode.window.showErrorMessage(`Failed to save workflow: ${error}`)
        }
    }
}

/**
 * Handles the workflow loading process by displaying an open dialog to the user, allowing them to select a workflow file.
 *
 * @returns The loaded workflow data, or `null` if the user cancels the operation or an error occurs.
 */
export async function handleWorkflowLoad(): Promise<any> {
    const workspaceRootFsPath = vscode.workspace.workspaceFolders?.[0]?.uri?.path
    const defaultFilePath = workspaceRootFsPath
        ? vscode.Uri.joinPath(
              vscode.Uri.file(workspaceRootFsPath),
              '.cody',
              'workflows',
              'workflow.json'
          )
        : vscode.Uri.file('workflow.json')

    const result = await vscode.window.showOpenDialog({
        defaultUri: defaultFilePath,
        canSelectMany: false,
        filters: {
            'Workflow Files': ['json'],
        },
        title: 'Load Workflow',
    })

    if (result?.[0]) {
        try {
            const content = await vscode.workspace.fs.readFile(result[0])
            const data = JSON.parse(content.toString())
            void vscode.window.showInformationMessage('Workflow loaded successfully!')
            return data
        } catch (error) {
            void vscode.window.showErrorMessage(`Failed to load workflow: ${error}`)
            return null
        }
    }
    return null
}
