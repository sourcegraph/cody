import * as vscode from 'vscode'

import { chatHistory } from '../chat/chat-view/ChatHistoryManager'
import { getChatPanelTitle } from '../chat/chat-view/chat-helpers'
import type { AuthStatus } from '../chat/protocol'

import type { ChatMessage } from '@sourcegraph/cody-shared'
import type { CodySidebarTreeItem } from './tree-views/treeViewItems'

interface GroupedChats {
    [groupName: string]: CodySidebarTreeItem[]
}

interface HistoryItem {
    label: string
    onSelect: () => Promise<void>
    kind?: vscode.QuickPickItemKind
}

interface ChatGroup {
    [groupName: string]: CodySidebarTreeItem[]
}

const dateEqual = (d1: Date, d2: Date): boolean => {
    return d1.getDate() === d2.getDate() && monthYearEqual(d1, d2)
}
const monthYearEqual = (d1: Date, d2: Date): boolean => {
    return d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()
}

export function groupCodyChats(authStatus: AuthStatus | undefined): GroupedChats | null {
    const todayChats: CodySidebarTreeItem[] = []
    const yesterdayChats: CodySidebarTreeItem[] = []
    const thisMonthChats: CodySidebarTreeItem[] = []
    const lastMonthChats: CodySidebarTreeItem[] = []
    const nMonthsChats: CodySidebarTreeItem[] = []

    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const lastMonth = new Date()
    lastMonth.setDate(0)

    const chatGroups: ChatGroup = {
        Today: todayChats,
        Yesterday: yesterdayChats,
        'This month': thisMonthChats,
        'Last month': lastMonthChats,
        'N months ago': nMonthsChats,
    }

    if (!authStatus) {
        return null
    }

    const chats = chatHistory.getLocalHistory(authStatus)?.chat
    if (!chats) {
        return null
    }
    const chatHistoryEntries = [...Object.entries(chats)]
    for (const [id, entry] of chatHistoryEntries) {
        let lastHumanMessage: ChatMessage | undefined = undefined
        // Can use Array.prototype.findLast once we drop Node 16
        for (let index = entry.interactions.length - 1; index >= 0; index--) {
            lastHumanMessage = entry.interactions[index]?.humanMessage
            if (lastHumanMessage) {
                break
            }
        }
        if (lastHumanMessage?.displayText && lastHumanMessage?.text) {
            const lastDisplayText = lastHumanMessage.displayText.split('\n')[0]
            const chatTitle = chats[id].chatTitle || getChatPanelTitle(lastDisplayText, false)

            const lastInteractionTimestamp = new Date(entry.lastInteractionTimestamp)
            let groupLabel = 'N months ago'

            if (dateEqual(today, lastInteractionTimestamp)) {
                groupLabel = 'Today'
            } else if (dateEqual(yesterday, lastInteractionTimestamp)) {
                groupLabel = 'Yesterday'
            } else if (monthYearEqual(today, lastInteractionTimestamp)) {
                groupLabel = 'This month'
            } else if (monthYearEqual(lastMonth, lastInteractionTimestamp)) {
                groupLabel = 'Last month'
            }

            const chatGroup = chatGroups[groupLabel]
            chatGroup.push({
                id,
                title: chatTitle,
                icon: 'comment-discussion',
                command: {
                    command: 'cody.chat.panel.restore',
                    args: [id, chatTitle],
                },
            })
        }
    }

    return {
        Today: todayChats.reverse(),
        Yesterday: yesterdayChats.reverse(),
        'This month': thisMonthChats.reverse(),
        'Last month': lastMonthChats.reverse(),
        'N months ago': nMonthsChats.reverse(),
    }
}

export async function displayHistoryQuickPick(authStatus: AuthStatus): Promise<void> {
    const groupedChats = groupCodyChats(authStatus)
    if (!groupedChats) {
        return
    }

    const quickPickItems: HistoryItem[] = []

    const addGroupSeparator = (groupName: string): void => {
        quickPickItems.push({
            label: groupName,
            onSelect: async () => {},
            kind: vscode.QuickPickItemKind.Separator,
        })
    }

    for (const [groupName, chats] of Object.entries(groupedChats)) {
        if (chats.length > 0) {
            addGroupSeparator(groupName.toLowerCase())

            for (const chat of chats) {
                quickPickItems.push({
                    label: chat.title,
                    onSelect: async () => {
                        await vscode.commands.executeCommand(
                            'cody.chat.panel.restore',
                            chat.id,
                            chat.title
                        )
                    },
                })
            }
        }
    }

    const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Search chat history',
    })

    if (selectedItem?.onSelect) {
        await selectedItem.onSelect()
    }
}
