import type { ContextItem } from '../../codebase-context/messages'
import type { ChatMessage } from './messages'

export interface InteractionJSON {
    humanMessage: ChatMessage
    assistantMessage: ChatMessage
    usedContextFiles: ContextItem[]
}
