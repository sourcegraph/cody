import * as vscode from 'vscode'
import { CodyTreeItem } from './TreeItemProvider'
import { CodyCommandMenuItems } from '../../commands'
import type { CodyCommand } from '@sourcegraph/cody-shared'

/**
 * Method to initialize the grouped chats for the Commands items
 */
export function getCommandTreeItems(customCommands: CodyCommand[]): CodyTreeItem[] {
    const treeNodes = []

    // Create a CodyTreeItem for each group and add to treeNodes
    for (const item of CodyCommandMenuItems) {
        const treeItem = new CodyTreeItem(
            item.key,
            item.description,
            item.icon,
            item.command,
            undefined,
            item.key === 'custom'
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None
        )
        treeItem.description = item.keybinding

        if (item.key === 'custom' && customCommands?.length) {
            try {
                treeItem.children = customCommands.map(
                    command =>
                        new CodyTreeItem(command.key as string, command.key, 'tools', {
                            command: 'cody.action.command',
                            args: [command.key],
                        })
                )
            } catch (e) {
                console.error('Error creating custom command tree items', e)
                treeItem.children = [new CodyTreeItem(e as string, e as string, 'bug')]
            }
        }
        treeNodes.push(treeItem)
    }

    void vscode.commands.executeCommand('setContext', 'cody.hasChatHistory', treeNodes.length)
    return treeNodes
}
