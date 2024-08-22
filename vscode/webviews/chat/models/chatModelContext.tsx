import type { Model } from '@sourcegraph/cody-shared'
import { createContext, useContext } from 'react'

/** React context data for the chat model choice. */
export interface ChatModelContext {
    chatModels?: Model[]
    onCurrentChatModelChange?: (model: Model) => void
    serverSentModelsEnabled?: boolean
}

const context = createContext<ChatModelContext>({})

export const ChatModelContextProvider = context.Provider

export function useChatModelContext(): ChatModelContext {
    return useContext(context)
}

export function useChatModelByID(
    model: string | undefined
): Pick<Model, 'id' | 'title' | 'provider'> | undefined {
    const { chatModels } = useChatModelContext()
    return (
        chatModels?.find(m => m.id === model) ??
        (model
            ? {
                  id: model,
                  title: model,
                  provider: 'unknown',
              }
            : undefined)
    )
}

export function useCurrentChatModel(): Model | undefined {
    const { chatModels } = useChatModelContext()
    return chatModels?.[0]
}
