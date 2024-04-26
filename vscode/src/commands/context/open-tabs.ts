import {
    type ContextItem,
    contextFiltersProvider,
    logError,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getContextFileFromUri } from './file-path'

/**
 * Gets context files from the currently open tabs.
 *
 * Iterates through all open tabs, filters to only file tabs in the workspace,
 * and then creates ContextFile objects for each valid tab.
 */
export async function getContextFileFromTabs(): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.openTabs', async () => {
        try {
            // Get open tabs from the current editor
            const tabGroups = vscode.window.tabGroups.all
            const openTabs = tabGroups.flatMap(group =>
                group.tabs.map(tab => tab.input)
            ) as vscode.TabInputText[]

            return (
                await Promise.all(
                    openTabs.map(async tab => {
                        // Skip non-file items
                        if (!tab.uri || tab.uri.scheme !== 'file') {
                            return []
                        }

                        if (!vscode.workspace.getWorkspaceFolder(tab.uri)) {
                            // Skip files that are not from the current workspace
                            return []
                        }

                        return getContextFileFromUri(tab.uri)
                    })
                )
            ).flat()
        } catch (error) {
            logError('getContextFileFromTabs', 'failed', { verbose: error })
            return []
        }
    })
}
