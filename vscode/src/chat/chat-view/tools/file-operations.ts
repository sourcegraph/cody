import { contextFiltersProvider, displayPath, logDebug } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getEditor } from '../../../editor/active-editor'

/**
 * Helper functions for file operations
 */
export const fileOps = {
    read: async (uri: vscode.Uri): Promise<string> => {
        try {
            const fileContent = await vscode.workspace.fs.readFile(uri)
            return Buffer.from(fileContent).toString('utf8')
        } catch (error: any) {
            throw new Error(`Failed to read file: ${error.message}`)
        }
    },

    write: async (uri: vscode.Uri, content: string): Promise<void> => {
        try {
            const contentBuffer = new TextEncoder().encode(content)
            await vscode.workspace.fs.writeFile(uri, contentBuffer)
        } catch (error: any) {
            throw new Error(`Failed to write file: ${error.message}`)
        }
    },

    /**
     * Create and initialize a new file with content
     */
    createFile: async (uri: vscode.Uri, fileText: string): Promise<void> => {
        try {
            // Create and populate the file
            const workspaceEditor = new vscode.WorkspaceEdit()
            workspaceEditor.createFile(uri, { overwrite: true, ignoreIfExists: true })
            workspaceEditor.insert(uri, new vscode.Position(0, 0), fileText)
            await vscode.workspace.applyEdit(workspaceEditor)

            // Save the file
            const doc = await vscode.workspace.openTextDocument(uri)
            await doc.save()
        } catch (error: any) {
            logDebug('file_operations', `Failed to create file ${uri.toString()}: ${error.message}`)
            throw error
        }
    },

    /**
     * Get workspace URI and validate file
     */
    getWorkspaceFile: async (
        filePath: string
    ): Promise<{ uri: vscode.Uri; doc: vscode.TextDocument } | null> => {
        const currentWorkspaceURI = vscode.workspace.workspaceFolders?.[0]?.uri
        if (!currentWorkspaceURI) {
            return null
        }

        const fileUri = vscode.Uri.joinPath(currentWorkspaceURI, filePath)
        if (await contextFiltersProvider.isUriIgnored(fileUri)) {
            return null
        }

        const doc = await vscode.workspace.openTextDocument(fileUri)
        return { uri: fileUri, doc }
    },

    getCurrentFileName(): string | undefined {
        const activeDoc = getEditor()?.active?.document
        return activeDoc ? displayPath(activeDoc.uri) : undefined
    },
}
