import {
    type ChatMessage,
    type SerializedPromptEditorValue,
    serializedPromptEditorStateFromChatMessage,
} from '@sourcegraph/cody-shared'
import type { PromptEditorRefAPI } from '@sourcegraph/prompt-editor'
import isEqual from 'lodash/isEqual'
import { type FunctionComponent, memo, useMemo } from 'react'
import type { UserAccountInfo } from '../../../../Chat'
import { UserAvatar } from '../../../../components/UserAvatar'
import { BaseMessageCell, MESSAGE_CELL_AVATAR_SIZE } from '../BaseMessageCell'
import { HumanMessageEditor } from './editor/HumanMessageEditor'

/**
 * A component that displays a chat message from the human.
 */
export const HumanMessageCell: FunctionComponent<{
    message: ChatMessage
    userInfo: UserAccountInfo
    chatEnabled: boolean

    /** Whether this editor is for the first message (not a followup). */
    isFirstMessage: boolean

    /** Whether this editor is for a message that has been sent already. */
    isSent: boolean

    /** Whether this editor is for a followup message to a still-in-progress assistant response. */
    isPendingPriorResponse: boolean

    onChange?: (editorState: SerializedPromptEditorValue) => void
    onSubmit: (editorValue: SerializedPromptEditorValue) => void
    onStop: () => void

    isFirstInteraction?: boolean
    isLastInteraction?: boolean
    isEditorInitiallyFocused?: boolean

    className?: string
    editorRef?: React.RefObject<PromptEditorRefAPI | null>

    /** For use in storybooks only. */
    __storybook__focus?: boolean
}> = memo(
    ({
        message,
        userInfo,
        chatEnabled = true,
        isFirstMessage,
        isSent,
        isPendingPriorResponse,
        onChange,
        onSubmit,
        onStop,
        isFirstInteraction,
        isLastInteraction,
        isEditorInitiallyFocused,
        className,
        editorRef,
        __storybook__focus,
    }) => {
        const messageJSON = JSON.stringify(message)
        const initialEditorState = useMemo(
            () => serializedPromptEditorStateFromChatMessage(JSON.parse(messageJSON)),
            [messageJSON]
        )

        return (
            <BaseMessageCell
                speakerIcon={
                    <UserAvatar
                        user={userInfo.user}
                        size={MESSAGE_CELL_AVATAR_SIZE}
                        sourcegraphGradientBorder={true}
                    />
                }
                speakerTitle={userInfo.user.displayName ?? userInfo.user.username}
                content={
                    <HumanMessageEditor
                        userInfo={userInfo}
                        initialEditorState={initialEditorState}
                        placeholder={isFirstMessage ? 'Ask...' : 'Ask a followup...'}
                        isFirstMessage={isFirstMessage}
                        isSent={isSent}
                        isPendingPriorResponse={isPendingPriorResponse}
                        onChange={onChange}
                        onSubmit={onSubmit}
                        onStop={onStop}
                        disabled={!chatEnabled}
                        isFirstInteraction={isFirstInteraction}
                        isLastInteraction={isLastInteraction}
                        isEditorInitiallyFocused={isEditorInitiallyFocused}
                        editorRef={editorRef}
                        __storybook__focus={__storybook__focus}
                    />
                }
                className={className}
            />
        )
    },
    isEqual
)
