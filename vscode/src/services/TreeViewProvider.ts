import * as vscode from 'vscode'

import { featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'

import { AuthStatus } from '../chat/protocol'

import { CodySidebarTreeItem, CodyTreeItemType, getCodyTreeItems } from './treeViewItems'

export class TreeViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private treeNodes: vscode.TreeItem[] = []
    private _disposables: vscode.Disposable[] = []
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>()
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event
    private authStatus: AuthStatus | undefined

    constructor(private type: CodyTreeItemType) {
        void this.updateTree(getCodyTreeItems(type))
    }

    /**
     * Gets the parent tree item for the given tree item.
     * @param treeItem - The tree item to get the parent for.
     * @returns The parent tree item, or undefined if the given item is a root item.
     */
    public getParent(treeItem: vscode.TreeItem): vscode.TreeItem | undefined {
        // Return undefine for root items
        if (!treeItem?.contextValue) {
            return undefined
        }
        // TODO implement getParent method for non-root items
        return undefined
    }

    /**
     * Updates the tree view with the provided tree items, filtering out any
     * that do not meet the required criteria to show.
     */
    public async updateTree(treeItems: CodySidebarTreeItem[]): Promise<void> {
        // TODO(dantup): This method can be made not-async again when we don't need to call evaluateFeatureFlag
        const updatedTree: vscode.TreeItem[] = []
        for (const item of treeItems) {
            if (item.requireFeature && !(await featureFlagProvider.evaluateFeatureFlag(item.requireFeature))) {
                continue
            }

            if (item.requireUpgradeAvailable && !(this.authStatus?.userCanUpgrade ?? false)) {
                continue
            }

            const treeItem = new vscode.TreeItem({ label: item.title })
            treeItem.id = item.id
            treeItem.iconPath = new vscode.ThemeIcon(item.icon)
            treeItem.description = item.description
            treeItem.command = { command: item.command.command, title: item.title, arguments: item.command.args }

            updatedTree.push(treeItem)
        }
        this.treeNodes = updatedTree
        this.refresh()
    }

    public syncAuthStatus(authStatus: AuthStatus): void {
        this.authStatus = authStatus
        void this.refresh()
    }

    /**
     * Refresh the tree view to get the latest data
     */
    public refresh(): void {
        if (this.type === 'chat') {
            void vscode.commands.executeCommand('setContext', 'cody.hasChatHistory', this.treeNodes.length)
        }
        this._onDidChangeTreeData.fire()
    }

    /**
     * Get parents items first
     * Then returns children items for each parent item
     */
    public getChildren(): vscode.TreeItem[] {
        return [...this.treeNodes.values()]
    }

    /**
     * Get individual tree item
     */
    public getTreeItem(treeItem: vscode.TreeItem): vscode.TreeItem {
        return treeItem
    }

    /**
     * Get individual tree item by chatID
     */
    public getTreeItemByID(chatID: string): vscode.TreeItem | undefined {
        return this.treeNodes.find(node => node.id === chatID)
    }

    /**
     * Empty the tree view
     */
    public reset(): void {
        void vscode.commands.executeCommand('setContext', 'cody.hasChatHistory', false)
        this.treeNodes = []
        this.refresh()
    }

    /**
     * Dispose the disposables
     */
    public dispose(): void {
        this.reset()
        for (const disposable of this._disposables) {
            disposable.dispose()
        }
        this._disposables = []
    }
}
