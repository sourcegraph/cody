import { CodyIDE } from '@sourcegraph/cody-shared'
import { createContext, useContext } from 'react'

export interface ChatEnvironmentContextData {
    clientType: CodyIDE
}

export const ChatEnvironmentContext = createContext<ChatEnvironmentContextData>({
    clientType: CodyIDE.VSCode,
})

export function useChatEnvironment() {
    return useContext(ChatEnvironmentContext)
}
