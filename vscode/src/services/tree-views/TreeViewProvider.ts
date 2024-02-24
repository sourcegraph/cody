import * as vscode from 'vscode'

import { type FeatureFlagProvider, isDotCom } from '@sourcegraph/cody-shared'

import type { AuthStatus } from '../../chat/protocol'

import type { CodyTreeItem } from './TreeItemProvider'
import { initializeGroupedChats } from './chat-history'
import { type CodySidebarTreeItem, type CodyTreeItemType, getCodyTreeItems } from './treeViewItems'

export class TreeViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private treeNodes: vscode.TreeItem[] = []
    private _disposables: vscode.Disposable[] = []
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>()
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event
    private authStatus: AuthStatus | undefined
    private treeItems: CodySidebarTreeItem[]
    constructor(
        private type: CodyTreeItemType,
        private readonly featureFlagProvider: FeatureFlagProvider
    ) {
        this.treeItems = getCodyTreeItems(type)
        void this.refresh()
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
    public async updateTree(authStatus: AuthStatus, treeItems?: CodySidebarTreeItem[]): Promise<void> {
        if (treeItems) {
            this.treeItems = treeItems
        }
        this.authStatus = authStatus
        return this.refresh()
    }

    public async setTreeNodes(nodes: CodyTreeItem[]): Promise<void> {
        this.treeNodes = nodes
        this._onDidChangeTreeData.fire(undefined)
    }

    /**
     * Refreshes the visible tree items, filtering out any
     * that do not meet the required criteria to show.
     */
    public async refresh(): Promise<void> {
        // TODO(dantup): This method can be made not-async again when we don't need to call evaluateFeatureFlag
        const updatedTree: vscode.TreeItem[] = []
        this.treeNodes = updatedTree // Set this before any awaits so last call here always wins regardless of async scheduling.
        for (const item of this.treeItems) {
            if (item.requireDotCom) {
                const isConnectedtoDotCom =
                    this.authStatus?.endpoint && isDotCom(this.authStatus?.endpoint)
                if (!isConnectedtoDotCom) {
                    continue
                }
            }

            if (
                item.requireFeature &&
                !(await this.featureFlagProvider.evaluateFeatureFlag(item.requireFeature))
            ) {
                continue
            }

            if (item.requireUpgradeAvailable && !(this.authStatus?.userCanUpgrade ?? false)) {
                continue
            }

            const treeItem = new vscode.TreeItem({ label: item.title })
            treeItem.id = item.id
            treeItem.iconPath = new vscode.ThemeIcon(item.icon)
            treeItem.description = item.description
            treeItem.command = {
                command: item.command.command,
                title: item.title,
                arguments: item.command.args,
            }

            updatedTree.push(treeItem)
        }

        if (this.type === 'chat') {
            this.treeNodes = await initializeGroupedChats(this.authStatus)
        }

        this._onDidChangeTreeData.fire(undefined)
    }

    public syncAuthStatus(authStatus: AuthStatus): void {
        this.authStatus = authStatus
        void this.refresh()
    }

    /**
     * Get parents items first
     * Then returns children items for each parent item
     */
    public async getChildren(element?: CodyTreeItem): Promise<CodyTreeItem[]> {
        if (element) {
            // Load children if not already loaded
            if (!element.children) {
                await element.loadChildNodes()
            }
            return element.children || []
        }
        return this.treeNodes as CodyTreeItem[]
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
        void this.refresh()
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
