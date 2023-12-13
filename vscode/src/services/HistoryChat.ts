import * as vscode from 'vscode'

import { getChatPanelTitle } from '../chat/chat-view/chat-helpers'
import { chatHistory } from '../chat/chat-view/ChatHistoryManager'

import { CodySidebarTreeItem } from './treeViewItems'

interface GroupedChats {
    [groupName: string]: CodySidebarTreeItem[]
}

interface HistoryItem {
    label: string
    onSelect: () => Promise<void>
    kind?: vscode.QuickPickItemKind
}

type ChatGroup = [number, CodySidebarTreeItem[]]

export function groupCodyChats(): GroupedChats | null {
    const todayChats: CodySidebarTreeItem[] = []
    const yesterdayChats: CodySidebarTreeItem[] = []
    const lastWeekChats: CodySidebarTreeItem[] = []
    const lastMonthChats: CodySidebarTreeItem[] = []
    const nDaysChats: CodySidebarTreeItem[] = []
    const nWeeksChats: CodySidebarTreeItem[] = []
    const nMonthsChats: CodySidebarTreeItem[] = []

    const chatGroups: ChatGroup[] = [
        [1, todayChats],
        [2, yesterdayChats],
        [7, nDaysChats],
        [14, lastWeekChats],
        [30, nWeeksChats],
        [60, lastMonthChats],
        [Infinity, nMonthsChats],
    ]

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

            for (const [dayLimit, chatGroup] of chatGroups) {
                if (timeDiff < dayLimit * 24 * 60 * 60 * 1000) {
                    chatGroup.push({
                        id,
                        title: chatTitle,
                        icon: 'comment-discussion',
                        command: {
                            command: 'cody.chat.panel.restore',
                            args: [id, chatTitle],
                        },
                    })
                    break
                }
            }
        }
    })

    return {
        Today: todayChats.reverse(),
        Yesterday: yesterdayChats.reverse(),
        'Last week': lastWeekChats.reverse(),
        'Last month': lastMonthChats.reverse(),
        'N days ago': nDaysChats.reverse(),
        'N weeks ago': nWeeksChats.reverse(),
        'N months ago': nMonthsChats.reverse(),
    }
}

export async function displayHistoryQuickPick(): Promise<void> {
    const groupedChats = groupCodyChats()
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
