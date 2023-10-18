import * as vscode from 'vscode'

import { UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { CODY_DOC_URL } from '../chat/protocol'

type CodyTreeItemType = 'command' | 'support' | 'search' | 'chat'
export class TreeViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private treeNodes: vscode.TreeItem[] = []
    private _disposables: vscode.Disposable[] = []
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>()
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event

    constructor(private type: CodyTreeItemType) {
        this.updateTree(this.getCodyTreeItems(type))
        this.refresh()
    }

    /**
     * Gets the tree view items to display based on the provided type.
     */
    private getCodyTreeItems(type: CodyTreeItemType): CodySidebarTreeItem[] {
        switch (type) {
            case 'command':
                return commandsItems
            case 'support':
                return supportItems
            default:
                return []
        }
    }

    /**
     * Updates the tree view with the provided tree items.
     */
    public updateTree(treeItems: CodySidebarTreeItem[]): void {
        const updatedTree: vscode.TreeItem[] = []
        treeItems.forEach(item => {
            const treeItem = new vscode.TreeItem({ label: item.title })
            treeItem.id = item.id
            treeItem.iconPath = new vscode.ThemeIcon(item.icon)
            treeItem.description = item.description
            treeItem.command = { command: item.command.command, title: item.title, arguments: item.command.args }

            updatedTree.push(treeItem)
        })
        this.treeNodes = updatedTree
        this.refresh()
    }

    /**
     * Refresh the tree view to get the latest data
     */
    public refresh(): void {
        if (this.type === 'chat') {
            void vscode.commands.executeCommand('setContext', 'cody.chat.history.isEmpty', this.treeNodes.length === 0)
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
    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element
    }

    /**
     * Empty the tree view
     */
    public reset(): void {
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

interface CodySidebarTreeItem {
    title: string
    icon: string
    id?: string
    description?: string
    command: {
        command: string
        args?: string[] | { [key: string]: string }[]
    }
}

const supportItems: CodySidebarTreeItem[] = [
    {
        title: 'Extension Settings',
        icon: 'gear',
        command: { command: 'cody.settings.extension' },
    },
    {
        title: 'Feature Settings',
        icon: 'cody-logo',
        command: { command: 'cody.status-bar.interacted' },
    },
    {
        title: 'Documentation & Help',
        icon: 'question',
        command: { command: 'vscode.open', args: [CODY_DOC_URL.href] },
    },
    {
        title: 'Keyboard Shortcuts',
        icon: 'keyboard',
        command: { command: 'workbench.action.openGlobalKeybindings' },
    },
    {
        title: 'Sign Out',
        icon: 'log-out',
        command: { command: 'cody.auth.signout' },
    },
]

const commandsItems: CodySidebarTreeItem[] = [
    {
        title: 'Document',
        icon: 'output',
        description: 'Add code documentation',
        command: { command: 'cody.command.document-code' },
    },
    {
        title: 'Edit',
        icon: 'wand',
        command: { command: 'cody.command.edit-code' },
        description: 'Edit Code with Instructions',
    },
    {
        title: 'Explain',
        icon: 'mortar-board',
        command: { command: 'cody.command.explain-code' },
        description: 'Explain code',
    },
    {
        title: 'Smell',
        icon: 'debug',
        command: { command: 'cody.command.smell-code' },
        description: 'Identify code smells',
    },
    {
        title: 'Test',
        icon: 'beaker',
        command: { command: 'cody.command.generate-tests' },
        description: 'Generate unit tests',
    },
    {
        title: 'Custom',
        icon: 'bookmark',
        command: { command: 'cody.action.commands.menu' },
        description: 'Custom commands',
    },
]

/**
 * Creates tree items for the Cody chat history to show in the sidebar.
 *
 * Takes the user's chat history and current empty chat ID.
 * Returns an array of CodySidebarTreeItems representing the chat history.
 * Loops through the chat history entries and creates a tree item for each one,
 * using the last human message text as the title.
 * Also adds a "New Chat" item if there is a current empty chat ID.
 * Reverses the array order so newest chats appear first.
 */
export function createCodyChatTreeItems(
    userHistory: UserLocalHistory,
    currentEmptyChatID?: string
): CodySidebarTreeItem[] {
    const chatTreeItems: CodySidebarTreeItem[] = []
    const chatHistoryEntries = [...Object.entries(userHistory.chat)]
    chatHistoryEntries.forEach(([id, entry]) => {
        const lastHumanMessage = entry.interactions.findLast(interaction => interaction.humanMessage)
        if (lastHumanMessage?.humanMessage.displayText && lastHumanMessage?.humanMessage.text) {
            chatTreeItems.push({
                id,
                title: lastHumanMessage.humanMessage.displayText.split('\n')[0],
                icon: 'comment',
                command: { command: 'cody.chat.panel.restore', args: [id] },
                description: entry.lastInteractionTimestamp,
            })
        }
    })
    if (currentEmptyChatID && chatTreeItems.length) {
        chatTreeItems.push({
            id: currentEmptyChatID,
            title: 'New Chat',
            icon: 'comment',
            command: { command: 'cody.chat.panel.restore', args: [currentEmptyChatID] },
            description: 'Current',
        })
    }
    return chatTreeItems.reverse()
}
