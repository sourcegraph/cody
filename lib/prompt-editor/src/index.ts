export { PromptEditor, type PromptEditorRefAPI } from './PromptEditor'
export { ContextItemMentionNode, MENTION_CLASS_NAME } from './nodes/ContextItemMentionNode'
export { MentionMenu } from './mentions/mentionMenu/MentionMenu'
export { BaseEditor } from './BaseEditor'
export { type MentionMenuParams } from './mentions/mentionMenu/useMentionMenuData'
export {
    ChatMentionContext,
    type ChatMentionsSettings,
} from './plugins/atMentions/useChatContextItems'
export { type PromptEditorConfig, PromptEditorConfigProvider } from './config'
export { useClientState, ClientStateContextProvider } from './clientState'
export {
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'
export * from './useExtensionAPI'
export { useObservable, type UseObservableResult } from './useObservable'
