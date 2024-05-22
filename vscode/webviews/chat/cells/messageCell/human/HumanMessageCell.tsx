import { type ChatMessage, type ContextItem, isMacOS } from '@sourcegraph/cody-shared'
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

const isMac = isMacOS()

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

    onChange?: (editorState: SerializedPromptEditorValue) => void
    onSubmit: (editorValue: SerializedPromptEditorValue, addEnhancedContext: boolean) => void

    isEditorInitiallyFocused?: boolean

    /** For use in storybooks only. */
    __storybook__focus?: boolean
}> = ({
    message,
    userInfo,
    chatEnabled = true,
    userContextFromSelection,
    isFirstMessage,
    isSent,
    onChange,
    onSubmit,
    isEditorInitiallyFocused,
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
                    placeholder={
                        isFirstMessage
                            ? 'Ask... (type @ to add context)'
                            : `Ask followup... (${isMac ? 'Opt' : 'Alt'}+>)`
                    }
                    isFirstMessage={isFirstMessage}
                    isSent={isSent}
                    onChange={onChange}
                    onSubmit={onSubmit}
                    disabled={!chatEnabled}
                    isEditorInitiallyFocused={isEditorInitiallyFocused}
                    __storybook__focus={__storybook__focus}
                />
            }
            contentClassName={styles.editor}
        />
    )
}
