import { type ContextItem, logError, wrapInActiveSpan } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getContextFileFromUri } from './file-path'

/**
 * Gets context files from the currently open tabs.
 *
 * Iterates through all open tabs, filters to only file tabs in the workspace,
 * and then creates ContextFile objects for each valid tab.
 */
export async function getContextFileFromTabs(): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.openTabs', async span => {
        const contextFiles: ContextItem[] = []
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
                contextFiles.push(...(await getContextFileFromUri(tab?.uri)))
            }
        } catch (error) {
            logError('getContextFileFromTabs', 'failed', { verbose: error })
        }
        // Returns what we have so far
        return contextFiles
    })
}
