import type { CodyCommand } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { CodyCommandMenuItems } from '../../commands'
import { CodyTreeItem } from './TreeItemProvider'

/**
 * Method to get items for the Commands sidebar
 */
export function getCommandTreeItems(customCommands: CodyCommand[]): CodyTreeItem[] {
    const treeNodes = []

    // Create a CodyTreeItem for each group and add to treeNodes
    // Log all event source as 'sidebar'
    for (const item of CodyCommandMenuItems) {
        const treeItem = new CodyTreeItem(
            item.key,
            item.description,
            item.icon,
            {
                command: 'cody.sidebar.commands',
                args: [item.key, item.command.command],
            },
            item.contextValue
        )
        treeItem.description = item.keybinding

        if (item.key === 'custom' && customCommands?.length) {
            treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
            try {
                treeItem.children = customCommands.map(
                    command =>
                        new CodyTreeItem(command.key, command.key, 'tools', {
                            command: 'cody.sidebar.commands',
                            args: [command.key, 'cody.action.command'],
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
