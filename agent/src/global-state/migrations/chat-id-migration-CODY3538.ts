import type * as vscode from 'vscode'

import type { AccountKeyedChatHistory } from '@sourcegraph/cody-shared'

// Fixes a bug from https://github.com/sourcegraph/jetbrains/pull/2108 where the chat ID
// was being imported as a UUID instead of a date.
export async function migrateChatHistoryCODY3538(storage: vscode.Memento): Promise<void> {
    const hasMigrated = storage.get<string | null>(MIGRATED_CHAT_HISTORY_KEY_CODY_3538)
    if (hasMigrated) {
        return
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    const history = storage.get<AccountKeyedChatHistory | null>(KEY_LOCAL_HISTORY, null)
    for (const accountHistory of Object.values(history ?? {})) {
        for (const [chatId, chat] of Object.entries(accountHistory.chat)) {
            // If the ID is a UUID, then this chat came from the JetBrains migration and needs to be fixed.
            if (uuidRegex.test(chatId) || uuidRegex.test(chat.lastInteractionTimestamp)) {
                let lastInteraction: Date
                const timestamp = Date.parse(chat.lastInteractionTimestamp)
                // If the timestamp can't be parsed, then this chat was restored and continued with a bad
                // ID, so the date was lost. But since we know it must have been interacted with since the
                // latest JetBrains release, it can't be too far in the past. So we'll just use the current
                // date.
                if (Number.isNaN(timestamp)) {
                    lastInteraction = new Date()
                } else {
                    lastInteraction = new Date(timestamp)
                }

                // Update the ID in the chat history.
                const newId = lastInteraction.toUTCString()
                chat.id = newId
                chat.lastInteractionTimestamp = newId
                delete accountHistory.chat[chatId]
                accountHistory.chat[newId] = chat
            }
        }
    }

    await storage.update(KEY_LOCAL_HISTORY, history)
    await storage.update(MIGRATED_CHAT_HISTORY_KEY_CODY_3538, true)
}

const MIGRATED_CHAT_HISTORY_KEY_CODY_3538 = 'migrated-chat-history-cody-3538'
// This is duplicated because we only want to run this migration if this specific
// key was incorrectly mutated. If the corresponding key in LocalStorageProvider
// has updated, by the time this migration runs, we won't need to run it on the
// new chat history.
const KEY_LOCAL_HISTORY = 'cody-local-chatHistory-v2'
