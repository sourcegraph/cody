import { type FC, type ReactNode, useEffect, useState } from 'react';
import type { UriComponents } from 'vscode-uri/lib/umd/uri';
import { isErrorLike } from '@sourcegraph/cody-shared';
import { ChatExportResult } from '@sourcegraph/vscode-cody//src/jsonrpc/agent-protocol';
import { useWebAgentClient } from './Provider';

interface ChildInput {
    chats: ChatExportResult[]
    loading: boolean
    error: Error | null
    selectChat: (chat: ChatExportResult) => unknown
    createNewChat: () => unknown
    deleteChat: (chat: ChatExportResult) => void
    isSelectedChat: (chat: ChatExportResult) => boolean
}

interface ChatHistoryProps {
    children: (input: ChildInput) => ReactNode
}

export const ChatHistory: FC<ChatHistoryProps> = props => {
    const { children } = props

    const {
        client,
        vscodeAPI,
        initialContext,
        activeWebviewPanelID,
        lastActiveChatID,
        setLastActiveChatID
    } = useWebAgentClient()

    const [chats, setChats] = useState<ChatExportResult[]>([])

    useEffect(() => {
        if (!client || isErrorLike(client)) {
            return
        }

        // Populate local chat state as we render chat history component for the
        // first time. It's possible that we missed chatHistory messages while
        // this component hadn't been rendered.
        client.rpc.sendRequest<ChatExportResult[]>('chat/export', { fullHistory: true })
            .then(setChats)
    }, [client]);

    // Subscribe on any chat history updates from the agent server
    // to track the most recent list of chats
    useEffect(() => {
        vscodeAPI.onMessage(message => {
            switch (message.type) {
                case 'chatHistory': {
                    if (message.value === null) {
                        return
                    }

                    const receivedChats: ChatExportResult[] = []

                    for (const [chatID, transcript] of Object.entries(message.value.chat)) {
                        receivedChats.push({ chatID, transcript })
                    }

                    setChats(chats => {
                        // Select only new chats that haven't been received before
                        // New chats means that we may have new chat blank item in the chats
                        // in this case we should replace them with real chats and update
                        // last active chat id
                        const newChats = receivedChats
                            .filter(chat =>
                                !chats.find(currentChat => currentChat.chatID === chat.chatID)
                            )

                        if (newChats.length > 0) {
                            setLastActiveChatID(newChats[newChats.length - 1].chatID)
                        }

                        return  receivedChats
                    })
                    return
                }
            }
        })
    }, [vscodeAPI]);

    const selectChat = async (chat: ChatExportResult): Promise<void> => {
        // Since chats were received through subscription event it's safe to
        // assume that all messages and chat data is most recent and updated
        const selectedChat = chats.find(item => item.chatID === chat.chatID)

        if (!selectedChat || !client || isErrorLike(client)) {
            return
        }

        // Restore chat with chat history (transcript data) and set the newly
        // restored panel ID to be able to listen event from only this panel
        // in the vscode API
        activeWebviewPanelID.current = await client.rpc.sendRequest('chat/restore', {
            chatID: selectedChat.chatID,
            messages: selectedChat
                .transcript
                .interactions
                .flatMap(interaction =>
                    // Ignore incomplete messages from bot, this might be possible
                    // if chat was closed before LLM responded with a final message chunk
                    [interaction.humanMessage, interaction.assistantMessage]
                        .filter(message => message)
                )
        })

        // Make sure that agent will reset the internal state and
        // sends all necessary events with transcript to switch active chat
        vscodeAPI.postMessage({ chatID: selectedChat.chatID, command: 'restoreHistory' })

        // Notify main root provider about chat selection
        setLastActiveChatID(selectedChat.chatID)
    }

    const deleteChat = async (chat: ChatExportResult): Promise<void> => {
        if (!client || isErrorLike(client)) {
            return
        }

        const nextChatIndexToSelect =
            Math.max(chats.findIndex(currentChat => currentChat.chatID === chat.chatID) - 1, 0)

        // Delete chat from the agent's store
        const newChatsList = await client.rpc.sendRequest<ChatExportResult[]>(
            'chat/delete',
            { chatID: chat.chatID }
        )

        setChats(newChatsList)

        // We've deleted the only chat, so we have to create a new empty chat
        if (newChatsList.length === 0) {
            await createNewChat()
            return
        }

        await selectChat(newChatsList[nextChatIndexToSelect] ?? newChatsList[0])
    }

    const createNewChat = async (): Promise<void> => {
        if (!client || isErrorLike(client)) {
            return
        }

        const currentChat = chats.find(chat => chat.chatID === lastActiveChatID)
        const emptyChat = chats.find(chat => chat.transcript.interactions.length === 0)

        // Don't create another empty chat if we already have one selected
        if (currentChat && currentChat.transcript.interactions.length === 0) {
            return
        }

        if (emptyChat) {
            await selectChat(emptyChat)
            return
        }

        activeWebviewPanelID.current = await client.rpc.sendRequest('chat/new', {
            repositories: initialContext.repositories,
            file: initialContext.fileURL
                ? {
                    scheme: 'remote-file',
                    authority: initialContext.repositories[0].name,
                    path: initialContext.fileURL
                } as UriComponents
                : undefined
        })

        setLastActiveChatID(null)
        vscodeAPI.postMessage({ command: 'initialized' })
    }

    return children({
        chats,
        loading: client === null,
        error: isErrorLike(client) ? client : null,
        selectChat,
        createNewChat,
        deleteChat,
        isSelectedChat: chat => chat.chatID === lastActiveChatID
    })
}

export function getChatTitle(chat: ChatExportResult): string {
    if (chat.transcript.chatTitle) {
        return chat.transcript.chatTitle
    }

    if (chat.transcript.interactions.length > 0) {
        const firstQuestion = chat
            .transcript.interactions.find(interaction => interaction.humanMessage.text)

        return firstQuestion?.humanMessage.text ?? ''
    }

    return chat.transcript.id
}
