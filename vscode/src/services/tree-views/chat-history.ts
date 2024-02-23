import * as vscode from 'vscode'
import type { AuthStatus } from '../../chat/protocol'
import { groupCodyChats } from '../HistoryChat'
import { CodyTreeItem } from './TreeItemProvider'

/**
 * Method to initialize the grouped chats for the History items
 */
export async function initializeGroupedChats(authStatus?: AuthStatus): Promise<CodyTreeItem[]> {
    const groupedChats = groupCodyChats(authStatus)
    if (!authStatus || !groupedChats) {
        void vscode.commands.executeCommand('setContext', 'cody.hasChatHistory', 0)
        return []
    }

    const treeNodes = []
    let firstGroup = true

    // Create a CodyTreeItem for each group and add to treeNodes
    for (const [groupLabel, chats] of Object.entries(groupedChats)) {
        // only display the group in the treeview for which chat exists
        if (!chats.length) {
            continue
        }
        const collapsibleState = firstGroup
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed

        const groupItem = new CodyTreeItem(
            groupLabel,
            groupLabel,
            undefined,
            undefined,
            undefined,
            collapsibleState,
            chats.map(
                chat =>
                    new CodyTreeItem(
                        chat.id as string,
                        chat.title,
                        chat.icon,
                        chat.command,
                        'cody.chats'
                    )
            )
        )
        treeNodes.push(groupItem)
        firstGroup = false
    }

    void vscode.commands.executeCommand('setContext', 'cody.hasChatHistory', treeNodes.length)
    return treeNodes
}
