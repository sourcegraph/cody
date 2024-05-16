import type { ModelProvider } from '@sourcegraph/cody-shared'
import { createContext, useContext } from 'react'

/** React context data for the chat model choice. */
export interface ChatModelContext {
    chatModels?: ModelProvider[]
    onCurrentChatModelChange?: (model: ModelProvider) => void
}

const context = createContext<ChatModelContext>({})

export const ChatModelContextProvider = context.Provider

export function useChatModelContext(): ChatModelContext {
    return useContext(context)
}

export function useChatModelByID(
    model: string | undefined
): Pick<ModelProvider, 'model' | 'title' | 'provider'> | undefined {
    const { chatModels } = useChatModelContext()
    return (
        chatModels?.find(m => m.model === model) ??
        (model
            ? {
                  model,
                  title: model,
                  provider: 'unknown',
              }
            : undefined)
    )
}

export function useCurrentChatModel(): ModelProvider | undefined {
    const { chatModels } = useChatModelContext()
    return chatModels?.find(model => model.default) ?? chatModels?.[0]
}
