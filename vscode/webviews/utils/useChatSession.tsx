import type { Model } from '@sourcegraph/cody-shared'
import { useExtensionAPI } from '@sourcegraph/prompt-editor'
import type React from 'react'
import { type FunctionComponent, createContext, useContext, useEffect, useState } from 'react'

const ChatModelsContext = createContext<Model[] | undefined>(undefined)
const useChatModels = () => useContext(ChatModelsContext) ?? []

/**
 * Provider component for the chat session context.
 *
 * Chat session context should be something that remain constant for the duration of the chat session
 * to avoid unnecessary re-renders or data fetching.
 */
export const ChatSessionProvider: FunctionComponent<{ children: React.ReactNode }> = ({ children }) => {
    const [models, setModels] = useState<Model[] | undefined>(undefined)

    // Only fetch the chat session context onces when the component mounts.
    useEffect(() => {
        const api = useExtensionAPI()
        const subscription = api.chatModels().subscribe(
            newModels => setModels(newModels),
            error => console.error('Error fetching chat models:', error)
        )
        return () => subscription.unsubscribe()
    }, [])

    return <ChatModelsContext.Provider value={models}>{children}</ChatModelsContext.Provider>
}

export const useChatSession = () => ({
    models: useChatModels(),
})
