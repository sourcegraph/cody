import * as vscode from 'vscode'

import { getChatPanelTitle } from '../chat/chat-view/chat-helpers'
import { chatHistory } from '../chat/chat-view/ChatHistoryManager'

import { CodySidebarTreeItem } from './treeViewItems'

interface GroupedChats {
    [groupName: string]: CodySidebarTreeItem[]
}

interface HistoryItems {
    label: string
    onSelect: () => Promise<void>
    kind?: vscode.QuickPickItemKind
}

export function groupCodyChats(): GroupedChats | null {
    const todayChats: CodySidebarTreeItem[] = []
    const yesterdayChats: CodySidebarTreeItem[] = []
    const lastWeekChats: CodySidebarTreeItem[] = []
    const lastMonthChats: CodySidebarTreeItem[] = []
    const NDaysChats: CodySidebarTreeItem[] = []
    const NWeeksChats: CodySidebarTreeItem[] = []
    const NMonthsChats: CodySidebarTreeItem[] = []

    const chats = chatHistory.localHistory?.chat
    if (!chats) {
        return null
    }
    const chatHistoryEntries = [...Object.entries(chats)]
    chatHistoryEntries.forEach(([id, entry]) => {
        const lastHumanMessage = entry?.interactions?.findLast(interaction => interaction?.humanMessage)
        if (lastHumanMessage?.humanMessage.displayText && lastHumanMessage?.humanMessage.text) {
            const lastDisplayText = lastHumanMessage.humanMessage.displayText.split('\n')[0]
            const chatTitle = chats[id].chatTitle || getChatPanelTitle(lastDisplayText)

            const currentTimeStamp = new Date()
            const lastInteractionTimestamp = new Date(entry.lastInteractionTimestamp)

            const timeDiff = currentTimeStamp.getTime() - lastInteractionTimestamp.getTime()

            if (timeDiff < 24 * 60 * 60 * 1000) {
                todayChats.push({
                    id,
                    title: chatTitle,
                    icon: 'comment-discussion',
                    command: { command: 'cody.chat.panel.restore', args: [id, chatTitle] },
                })
            } else if (timeDiff < 48 * 60 * 60 * 1000) {
                yesterdayChats.push({
                    id,
                    title: chatTitle,
                    icon: 'comment-discussion',
                    command: { command: 'cody.chat.panel.restore', args: [id, chatTitle] },
                })
            } else if (timeDiff < 7 * 24 * 60 * 60 * 1000) {
                NDaysChats.push({
                    id,
                    title: chatTitle,
                    icon: 'comment-discussion',
                    command: { command: 'cody.chat.panel.restore', args: [id, chatTitle] },
                })
            } else if (timeDiff < 14 * 24 * 60 * 60 * 1000) {
                lastWeekChats.push({
                    id,
                    title: chatTitle,
                    icon: 'comment-discussion',
                    command: { command: 'cody.chat.panel.restore', args: [id, chatTitle] },
                })
            } else if (timeDiff < 30 * 24 * 60 * 60 * 1000) {
                NWeeksChats.push({
                    id,
                    title: chatTitle,
                    icon: 'comment-discussion',
                    command: { command: 'cody.chat.panel.restore', args: [id, chatTitle] },
                })
            } else if (timeDiff < 60 * 24 * 60 * 60 * 1000) {
                lastMonthChats.push({
                    id,
                    title: chatTitle,
                    icon: 'comment-discussion',
                    command: { command: 'cody.chat.panel.restore', args: [id, chatTitle] },
                })
            } else {
                NMonthsChats.push({
                    id,
                    title: chatTitle,
                    icon: 'comment-discussion',
                    command: { command: 'cody.chat.panel.restore', args: [id, chatTitle] },
                })
            }
        }
    })

    return {
        Today: todayChats.reverse(),
        Yesterday: yesterdayChats.reverse(),
        'Last Week': lastWeekChats.reverse(),
        'Last month': lastMonthChats.reverse(),
        'N days ago': NDaysChats.reverse(),
        'N weeks ago': NWeeksChats.reverse(),
        'N months ago': NMonthsChats.reverse(),
    }
}

export async function displayHistoryQuickPick(): Promise<void> {
    const groupedChats = groupCodyChats()
    if (!groupedChats) {
        return
    }

    const quickPickItems: HistoryItems[] = []

    const addGroupSeparator = (groupName: string): void => {
        quickPickItems.push({
            label: groupName,
            onSelect: async () => {},
            kind: vscode.QuickPickItemKind.Separator,
        })
    }

    for (const [groupName, chats] of Object.entries(groupedChats)) {
        if (chats.length > 0) {
            addGroupSeparator(groupName)

            chats.forEach(chat => {
                quickPickItems.push({
                    label: chat.title,
                    onSelect: async () => {
                        await vscode.commands.executeCommand('cody.chat.panel.restore', chat.id)
                    },
                })
            })
        }
    }

    const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Search chat history',
    })

    if (selectedItem?.onSelect) {
        await selectedItem.onSelect()
    }
}
