import { createContext } from 'react'

export interface ChatMentionsSettings {
    resolutionMode: 'remote' | 'local'
    remoteRepositoriesNames?: string[]
}

export const ChatMentionContext = createContext<ChatMentionsSettings>({
    resolutionMode: 'local',
})
