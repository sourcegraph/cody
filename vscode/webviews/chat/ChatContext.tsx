/**
 * ChatContext.tsx
 *
 * This file provides a global React context for managing chat state across components,
 * particularly for handling prompt templates and intent persistence.
 *
 * The context addresses a key challenge: when users select a prompt template,
 * we need to:
 * 1. Save their current chat intent
 * 2. Track that they're using a prompt
 * 3. Restore their original intent after the prompt is submitted
 *
 * This context provides a reliable way to access these state values throughout
 * the component tree without passing props through every component.
 */
import type { ChatMessage } from '@sourcegraph/cody-shared'
import { createContext, useContext } from 'react'

interface ChatContextType {
    isPromptInput: boolean | undefined
    setIsPromptInput: (value: boolean) => void

    /** The intent that was active before a prompt template was selected */
    savedIntentBeforePrompt: ChatMessage['intent']
    setSavedIntentBeforePrompt: (intent: ChatMessage['intent']) => void
}

export const ChatContext = createContext<ChatContextType>({
    isPromptInput: false,
    setIsPromptInput: () => {},
    savedIntentBeforePrompt: 'chat',
    setSavedIntentBeforePrompt: () => {},
})

export const useChatContext = () => useContext(ChatContext)
