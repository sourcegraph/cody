import {
    type SerializedChatTranscript,
    type WebviewToExtensionAPI,
    firstResultFromOperation,
} from '@sourcegraph/cody-shared'
import { ChatHistoryType } from '@sourcegraph/cody-shared/src/chat/transcript'

/**
 * Use native browser download dialog to download chat history as a JSON file.
 */
export async function downloadChatHistory(
    extensionAPI: Pick<WebviewToExtensionAPI, 'userHistory'>
): Promise<void> {
    const userHistory = await firstResultFromOperation(extensionAPI.userHistory(ChatHistoryType.Full))
    const chatHistory: SerializedChatTranscript[] | null = userHistory?.chat
        ? Object.values(userHistory.chat)
        : null
    if (!chatHistory || chatHistory.length === 0) {
        return
    }
    const json = JSON.stringify(chatHistory, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5) // Format: YYYY-MM-DDTHH-mm
    const a = document.createElement('a') // a temporary anchor element
    a.href = url
    a.download = `cody-chat-history-${timestamp}.json`
    a.target = '_blank'
    a.click()
}
