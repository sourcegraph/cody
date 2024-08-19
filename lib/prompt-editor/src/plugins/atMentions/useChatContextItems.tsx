import { createContext } from 'react'

export interface ChatMentionsSettings {
    resolutionMode: 'remote' | 'local'
}

export const ChatMentionContext = createContext<ChatMentionsSettings>({
    resolutionMode: 'local',
})
