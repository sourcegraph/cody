import * as vscode from 'vscode'

import { isDotCom, type FeatureFlagProvider } from '@sourcegraph/cody-shared'

import { type AuthStatus } from '../chat/protocol'
import { getFullConfig } from '../configuration'

import { groupCodyChats } from './HistoryChat'
import { getCodyTreeItems, type CodySidebarTreeItem, type CodyTreeItemType } from './treeViewItems'

export class ChatTreeItem extends vscode.TreeItem {
    public children: ChatTreeItem[] | undefined

    constructor(
        public readonly id: string,
        title: string,
        icon?: string,
        command?: {
            command: string
            args?: string[] | { [key: string]: string }[]
        },
        contextValue?: string,
        collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        children?: ChatTreeItem[]
    ) {
        super(title, collapsibleState)
        this.id = id
        if (icon) {
            this.iconPath = new vscode.ThemeIcon(icon)
        }
        if (command) {
            this.command = {
                command: command.command,
                title,
                arguments: command.args,
            }
        }
        if (contextValue) {
            this.contextValue = contextValue
        }
        this.children = children
    }
    public async loadChildNodes(): Promise<ChatTreeItem[] | undefined> {
        await Promise.resolve()
        return this.children
    }
}

export class TreeViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private treeNodes: vscode.TreeItem[] = []
    private _disposables: vscode.Disposable[] = []
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>()
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event
    private authStatus: AuthStatus | undefined
    private treeItems: CodySidebarTreeItem[]

    public revivedChatItems: string[] = []

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

    /**
     * Refreshes the visible tree items, filtering out any
     * that do not meet the required criteria to show.
     */
    public async refresh(): Promise<void> {
        // TODO(dantup): This method can be made not-async again when we don't need to call evaluateFeatureFlag
        const updatedTree: vscode.TreeItem[] = []
        this.treeNodes = updatedTree // Set this before any awaits so last call here always wins regardless of async scheduling.
        for (const item of this.treeItems) {
            if (item.isUnstable) {
                const config = await getFullConfig()
                if (!config.internalUnstable) {
                    continue
                }
            }

            if (item.requireDotCom) {
                const isConnectedtoDotCom = this.authStatus?.endpoint && isDotCom(this.authStatus?.endpoint)
                if (!isConnectedtoDotCom) {
                    continue
                }
            }

            if (item.requireFeature && !(await this.featureFlagProvider.evaluateFeatureFlag(item.requireFeature))) {
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

        if (this.type === 'chat') {
            await this.initializeGroupedChats()
            void vscode.commands.executeCommand('setContext', 'cody.hasChatHistory', this.treeNodes.length)
        }
        this._onDidChangeTreeData.fire()
    }

    /**
     * Method to initialize the grouped chats for the History items
     */
    private async initializeGroupedChats(): Promise<void> {
        const groupedChats = groupCodyChats(this.authStatus)
        if (!groupedChats) {
            return
        }

        this.treeNodes = []

        let firstGroup = true

        // Create a ChatTreeItem for each group and add to treeNodes
        Object.entries(groupedChats).forEach(([groupLabel, chats]) => {
            // only display the group in the treeview for which chat exists

            if (chats.length) {
                const collapsibleState =
                    firstGroup || chats.some(chat => this.revivedChatItems.includes(chat.id as string))
                        ? vscode.TreeItemCollapsibleState.Expanded
                        : vscode.TreeItemCollapsibleState.Collapsed

                const groupItem = new ChatTreeItem(
                    groupLabel,
                    groupLabel,
                    undefined,
                    undefined,
                    undefined,
                    collapsibleState,
                    chats.map(
                        chat => new ChatTreeItem(chat.id as string, chat.title, chat.icon, chat.command, 'cody.chats')
                    )
                )
                if (collapsibleState === vscode.TreeItemCollapsibleState.Expanded) {
                    this._onDidChangeTreeData.fire(groupItem)
                }

                this.treeNodes.push(groupItem)
                firstGroup = false
            }
        })
        await Promise.resolve()
    }

    public syncAuthStatus(authStatus: AuthStatus): void {
        this.authStatus = authStatus
        void this.refresh()
    }

    /**
     * Get parents items first
     * Then returns children items for each parent item
     */
    public async getChildren(element?: ChatTreeItem): Promise<ChatTreeItem[]> {
        if (element) {
            // Load children if not already loaded
            if (!element.children) {
                await element.loadChildNodes()
            }
            return element.children || []
        }
        return this.treeNodes as ChatTreeItem[]
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
