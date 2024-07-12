import type { ChatSession } from './chat/chat-view/ChatController'
import type { FixupTask } from './non-stop/FixupTask'

export type CommandResult = ChatCommandResult | EditCommandResult
export interface ChatCommandResult {
    type: 'chat'
    session?: ChatSession
}
export interface EditCommandResult {
    type: 'edit'
    task?: FixupTask
}
