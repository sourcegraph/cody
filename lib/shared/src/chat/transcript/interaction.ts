import type { ContextItem, ContextMessage } from '../../codebase-context/messages'
import type { ChatMessage } from './messages'

export interface InteractionJSON {
    humanMessage: ChatMessage
    assistantMessage: ChatMessage
    fullContext: ContextMessage[]
    usedContextFiles: ContextItem[]
    timestamp: string
}
