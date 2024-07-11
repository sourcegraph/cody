import * as vscode from 'vscode'

import { chatHistory } from '../chat/chat-view/ChatHistoryManager'
import { getChatPanelTitle } from '../chat/chat-view/chat-helpers'

import { type AuthStatus, type ChatMessage, PromptString } from '@sourcegraph/cody-shared'
import { prepareChatMessage } from '../chat/chat-view/ChatModel'
import { getRelativeChatPeriod } from '../common/time-date'
import type { CodySidebarTreeItem } from './tree-views/treeViewItems'

interface GroupedChats {
    [groupName: string]: CodySidebarTreeItem[]
}

interface HistoryItem {
    label: string
    onSelect: () => Promise<void>
    kind?: vscode.QuickPickItemKind
}

export function groupCodyChats(authStatus: AuthStatus | undefined): GroupedChats | null {
    const chatHistoryGroups = new Map<string, CodySidebarTreeItem[]>()

    if (!authStatus) {
        return null
    }

    const chats = chatHistory.getLocalHistory(authStatus)?.chat
    if (!chats) {
        return null
    }

    const chatHistoryEntries = [...Object.entries(chats)].reverse()
    for (const [id, entry] of chatHistoryEntries) {
        let lastHumanMessage: ChatMessage | undefined = undefined

        // Can use Array.prototype.findLast once we drop Node 16
        for (let index = entry.interactions.length - 1; index >= 0; index--) {
            lastHumanMessage = prepareChatMessage(
                PromptString.unsafe_deserializeChatMessage(entry.interactions[index]?.humanMessage)
            )
            if (lastHumanMessage) {
                break
            }
        }

        if (lastHumanMessage?.text) {
            const lastHumanText = lastHumanMessage.text?.toString()
            const chatTitle = chats[id].chatTitle || getChatPanelTitle(lastHumanText, false)
            const timestamp = new Date(entry.lastInteractionTimestamp)
            const timeUnit = getRelativeChatPeriod(timestamp)

            if (!chatHistoryGroups.has(timeUnit)) {
                chatHistoryGroups.set(timeUnit, [])
            }

            const chatItem = {
                id,
                title: chatTitle,
                icon: 'comment-discussion',
                command: {
                    command: 'cody.chat.panel.restore',
                    args: [id, chatTitle],
                },
            }

            chatHistoryGroups.get(timeUnit)?.push(chatItem)
        }
    }

    return Object.fromEntries(chatHistoryGroups)
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
