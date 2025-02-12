import {
    type ChatMessage,
    CodyIDE,
    type Model,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
    serializedPromptEditorStateFromChatMessage,
} from '@sourcegraph/cody-shared'
import type { PromptEditorRefAPI } from '@sourcegraph/prompt-editor'
import isEqual from 'lodash/isEqual'
import { type FC, memo, useMemo } from 'react'
import { BaseMessageCell } from '../BaseMessageCell'
import { HumanMessageEditor } from './editor/HumanMessageEditor'

interface ToolCodyHumanMessageCellProps {
    message: ChatMessage
    models: Model[]

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
}

/**
 * A component that displays a chat message from the human.
 */
export const ToolCodyHumanMessageCell: FC<ToolCodyHumanMessageCellProps> = ({
    message,
    ...otherProps
}) => {
    const messageJSON = JSON.stringify(message)

    const initialEditorState = useMemo(
        () => serializedPromptEditorStateFromChatMessage(JSON.parse(messageJSON)),
        [messageJSON]
    )

    return <HumanMessageCellContent {...otherProps} initialEditorState={initialEditorState} />
}

type ToolCodyHumanMessageCellContent = {
    initialEditorState: SerializedPromptEditorState
} & Omit<ToolCodyHumanMessageCellProps, 'message'>
const HumanMessageCellContent = memo<ToolCodyHumanMessageCellContent>(props => {
    const {
        models,
        initialEditorState,
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
        onEditorFocusChange,
    } = props

    return (
        <BaseMessageCell
            content={
                <HumanMessageEditor
                    models={models}
                    userInfo={{
                        isCodyProUser: true,
                        isDotComUser: true,
                        user: { endpoint: 'https://example.com', username: 'lol' },
                        IDE: CodyIDE.VSCode,
                    }}
                    initialEditorState={initialEditorState}
                    placeholder={
                        isFirstMessage
                            ? 'Ask anything. Use @ to specify context...'
                            : 'Ask a followup...'
                    }
                    isFirstMessage={isFirstMessage}
                    isSent={isSent}
                    isPendingPriorResponse={isPendingPriorResponse}
                    onChange={onChange}
                    onSubmit={onSubmit}
                    onStop={onStop}
                    disabled={false}
                    isFirstInteraction={isFirstInteraction}
                    isLastInteraction={isLastInteraction}
                    isEditorInitiallyFocused={isEditorInitiallyFocused}
                    editorRef={editorRef}
                    onEditorFocusChange={onEditorFocusChange}
                    manuallySelectIntent={() => {}}
                />
            }
            className={className}
        />
    )
}, isEqual)
