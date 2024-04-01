import type { ChatMessage } from '@sourcegraph/cody-shared'
import { type FunctionComponent, useMemo } from 'react'
import type { UserAccountInfo } from '../../../../Chat'
import { UserAvatar } from '../../../../Components/UserAvatar'
import {
    type SerializedPromptEditorValue,
    serializedPromptEditorStateFromChatMessage,
} from '../../../../promptEditor/PromptEditor'
import { BaseMessageCell } from '../BaseMessageCell'
import { HumanMessageEditor } from './editor/HumanMessageEditor'

// TODO!(sqs): make sure command prompts can't be edited

/**
 * A component that displays a chat message from the human.
 */
export const HumanMessageCell: FunctionComponent<{
    message: ChatMessage | null
    userInfo: UserAccountInfo

    /** Whether this editor is for the first message (not a followup). */
    isFirstMessageInTranscript: boolean

    onSubmit: (editorValue: SerializedPromptEditorValue, addEnhancedContext: boolean) => void

    /** For use in storybooks only. */
    __storybook__alwaysShowToolbar?: boolean
}> = ({ message, userInfo, isFirstMessageInTranscript, onSubmit, __storybook__alwaysShowToolbar }) => {
    const initialEditorState = useMemo(
        () => (message ? serializedPromptEditorStateFromChatMessage(message) : undefined),
        [message]
    )

    const TIPS = '(@ for files, @# for symbols)'

    return (
        <BaseMessageCell
            speaker="human"
            speakerIcon={<UserAvatar user={userInfo.user} size={20} />}
            content={
                <HumanMessageEditor
                    initialEditorState={initialEditorState}
                    placeholder={
                        isFirstMessageInTranscript ? `Message ${TIPS}` : `Follow-up Message ${TIPS}`
                    }
                    isFirstMessageInTranscript={isFirstMessageInTranscript}
                    onSubmit={onSubmit}
                    userInfo={userInfo}
                    __storybook__alwaysShowToolbar={__storybook__alwaysShowToolbar}
                />
            }
        />
    )
}
