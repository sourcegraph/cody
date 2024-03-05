import type { ContextItem, ContextMessage } from '../../codebase-context/messages'
import type { InteractionMessage } from './messages'

export interface InteractionJSON {
    humanMessage: InteractionMessage
    assistantMessage: InteractionMessage
    fullContext: ContextMessage[]
    usedContextFiles: ContextItem[]
    timestamp: string
}
