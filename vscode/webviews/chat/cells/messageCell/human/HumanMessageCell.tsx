import type { ChatMessage, ContextItem } from '@sourcegraph/cody-shared'
import { type FunctionComponent, useMemo } from 'react'
import type { UserAccountInfo } from '../../../../Chat'
import { UserAvatar } from '../../../../components/UserAvatar'
import {
    type SerializedPromptEditorValue,
    serializedPromptEditorStateFromChatMessage,
} from '../../../../promptEditor/PromptEditor'
import { BaseMessageCell } from '../BaseMessageCell'
import styles from './HumanMessageCell.module.css'
import { HumanMessageEditor } from './editor/HumanMessageEditor'

/**
 * A component that displays a chat message from the human.
 */
export const HumanMessageCell: FunctionComponent<{
    message: ChatMessage | null
    userInfo: UserAccountInfo
    chatEnabled?: boolean
    userContextFromSelection?: ContextItem[]

    /** Whether this editor is for the first message (not a followup). */
    isFirstMessage: boolean

    /** Whether this editor is for a message that has been sent already. */
    isSent: boolean

    /** Whether this editor is for a message whose assistant response is in progress. */
    isPendingResponse: boolean

    onChange?: (editorState: SerializedPromptEditorValue) => void
    onSubmit: (editorValue: SerializedPromptEditorValue, addEnhancedContext: boolean) => void

    isEditorInitiallyFocused?: boolean

    className?: string

    /** For use in storybooks only. */
    __storybook__focus?: boolean
}> = ({
    message,
    userInfo,
    chatEnabled = true,
    userContextFromSelection,
    isFirstMessage,
    isSent,
    isPendingResponse,
    onChange,
    onSubmit,
    isEditorInitiallyFocused,
    className,
    __storybook__focus,
}) => {
    const initialEditorState = useMemo(
        () => (message ? serializedPromptEditorStateFromChatMessage(message) : undefined),
        [message]
    )

    return (
        <BaseMessageCell
            speaker="human"
            speakerIcon={<UserAvatar user={userInfo.user} size={24} className={styles.speakerIcon} />}
            content={
                <HumanMessageEditor
                    userInfo={userInfo}
                    userContextFromSelection={userContextFromSelection}
                    initialEditorState={initialEditorState}
                    placeholder={isFirstMessage ? 'Message' : 'Followup message'}
                    isFirstMessage={isFirstMessage}
                    isSent={isSent}
                    isPendingResponse={isPendingResponse}
                    onChange={onChange}
                    onSubmit={onSubmit}
                    disabled={!chatEnabled}
                    isEditorInitiallyFocused={isEditorInitiallyFocused}
                    __storybook__focus={__storybook__focus}
                />
            }
            contentClassName={styles.editor}
            className={className}
        />
    )
}
