import { contextFiltersProvider } from '@sourcegraph/cody-shared'
import { type ContextItem, displayPath } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getEditor } from '../../editor/active-editor'

export function convertContextItemToInlineMessage(items: ContextItem[]): string {
    return items
        .map(item => {
            const { title, content, uri } = item
            const fileName = displayPath(uri)
            return `<context title=${title}>\n\`\`\`${fileName}\n${content}\n\`\`\`\n</context>`
        })
        .join('\n\n---\n\n')
}

// Utility function to get workspace URI and validate file
export async function getWorkspaceFile(
    filePath: string
): Promise<{ uri: vscode.Uri; doc: vscode.TextDocument } | null> {
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
}

export function getCurrentFileName(): string | undefined {
    const activeDoc = getEditor()?.active?.document
    return activeDoc ? displayPath(activeDoc.uri) : undefined
}
