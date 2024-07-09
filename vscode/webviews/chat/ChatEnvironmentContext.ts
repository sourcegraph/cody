import { createContext, useContext } from 'react'

export enum ChatClientType {
    Web = 'web',
    VsCode = 'vscode',
}

interface ChatEnvironmentContextData {
    clientType: ChatClientType
}

export const ChatEnvironmentContext = createContext<ChatEnvironmentContextData>({
    clientType: ChatClientType.VsCode,
})

export function useChatEnvironment() {
    return useContext(ChatEnvironmentContext)
}
