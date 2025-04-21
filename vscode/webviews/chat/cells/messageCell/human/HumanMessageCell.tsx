import {
    type ChatMessage,
    type Model,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
    serializedPromptEditorStateFromChatMessage,
} from '@sourcegraph/cody-shared'
import type { PromptEditorRefAPI } from '@sourcegraph/prompt-editor'
import isEqual from 'lodash/isEqual'
import { type FC, memo, useMemo } from 'react'
import type { UserAccountInfo } from '../../../../Chat'
import { BaseMessageCell } from '../BaseMessageCell'
import { HumanMessageEditor } from './editor/HumanMessageEditor'

interface HumanMessageCellProps {
    message: ChatMessage
    models: Model[]
    userInfo: UserAccountInfo
    chatEnabled: boolean

    /** Whether this editor is for the first message (not a followup). */
    isFirstMessage: boolean

    /** Whether this editor is for a message that has been sent already. */
    isSent: boolean

    /** Whether this editor is for a followup message to a still-in-progress assistant response. */
    isPendingPriorResponse: boolean

    onEditorFocusChange?: (focused: boolean) => void
    onChange?: (editorState: SerializedPromptEditorValue) => void
    onSubmit: (intent?: ChatMessage['intent']) => void
    onStop: () => void

    isFirstInteraction?: boolean
    isLastInteraction?: boolean
    isEditorInitiallyFocused?: boolean

    className?: string
    editorRef?: React.RefObject<PromptEditorRefAPI | null>

    intent: ChatMessage['intent']
    manuallySelectIntent: (intent: ChatMessage['intent']) => void

    /** For use in storybooks only. */
    __storybook__focus?: boolean
}

/**
 * A component that displays a chat message from the human.
 */
export const HumanMessageCell: FC<HumanMessageCellProps> = ({ message, ...otherProps }) => {
    // Don't render the editor if the message text is explicitly undefined or empty,
    // and it's been sent already and it's not the last interaction (i.e. there is a tool result response).
    if (
        (message.text === undefined || (message.text && message.text.length === 0)) &&
        otherProps.isSent &&
        !otherProps.isLastInteraction &&
        message.intent === 'agentic'
    ) {
        return null
    }

    const messageJSON = JSON.stringify(message)

    const initialEditorState = useMemo(
        () => serializedPromptEditorStateFromChatMessage(JSON.parse(messageJSON)),
        [messageJSON]
    )

    return <HumanMessageCellContent {...otherProps} initialEditorState={initialEditorState} />
}

type HumanMessageCellContent = {
    initialEditorState: SerializedPromptEditorState
} & Omit<HumanMessageCellProps, 'message'>
const HumanMessageCellContent = memo<HumanMessageCellContent>(props => {
    const {
        models,
        initialEditorState,
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
        onEditorFocusChange,
        intent,
        manuallySelectIntent,
    } = props

    return (
        <BaseMessageCell
            content={
                <HumanMessageEditor
                    models={models}
                    userInfo={userInfo}
                    initialEditorState={initialEditorState}
                    placeholder={
                        isFirstMessage
                            ? 'Ask anything. Use @ to specify context...'
                            : 'Use @ to add more context...'
                    }
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
                    onEditorFocusChange={onEditorFocusChange}
                    intent={intent}
                    manuallySelectIntent={manuallySelectIntent}
                    __logPrefix="HumanMessageCell"
                />
            }
            className={className}
        />
    )
}, isEqual)
