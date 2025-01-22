export {
    CodyWebChat,
    type CodyWebChatProps,
    type CodyWebChatController,
    type ViewType,
    type MessageHandler,
    type ControllerMessage,
    type CodyWebChatMessage,
} from './components/CodyWebChat'
export { CodyPromptTemplate, type CodyPromptTemplateProps } from './components/CodyPromptTemplate'
export { ChatSkeleton } from './components/skeleton/ChatSkeleton'

export type { Repository, InitialContext, CodyExternalApi, PromptEditorRefAPI } from './types'

export {
    serialize,
    deserialize,
    type ChatMessage,
} from '@sourcegraph/cody-shared'
