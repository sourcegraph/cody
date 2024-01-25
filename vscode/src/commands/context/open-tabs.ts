import type { ContextFile } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getContextFileFromUri } from './file-path'

export async function getContextFileFromTabs(): Promise<ContextFile[]> {
    const contextFiles: ContextFile[] = []
    try {
        // Get open tabs from the current editor
        const tabGroups = vscode.window.tabGroups.all
        const openTabs = tabGroups.flatMap(group =>
            group.tabs.map(tab => tab.input)
        ) as vscode.TabInputText[]

        for (const tab of openTabs) {
            // Skip non-file items
            if (tab?.uri?.scheme !== 'file') {
                continue
            }

            // Skip files that are not from the current workspace
            if (!vscode.workspace.getWorkspaceFolder(tab?.uri)) {
                continue
            }

            // Create context message
            const contextFile = await getContextFileFromUri(tab?.uri)
            if (contextFile) {
                contextFiles.push(contextFile)
            }
        }
    } catch (error) {
        console.log(error)
    }
    return contextFiles
}
