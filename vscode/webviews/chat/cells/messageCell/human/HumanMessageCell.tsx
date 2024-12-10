import {
    type ChatMessage,
    type Model,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
    serializedPromptEditorStateFromChatMessage,
} from '@sourcegraph/cody-shared'
import type { PromptEditorRefAPI } from '@sourcegraph/prompt-editor'
import isEqual from 'lodash/isEqual'
import { ColumnsIcon } from 'lucide-react'
import { type FC, memo, useMemo } from 'react'
import type { UserAccountInfo } from '../../../../Chat'
import { UserAvatar } from '../../../../components/UserAvatar'
import { BaseMessageCell, MESSAGE_CELL_AVATAR_SIZE } from '../BaseMessageCell'
import { HumanMessageEditor } from './editor/HumanMessageEditor'

import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../components/shadcn/ui/tooltip'
import { getVSCodeAPI } from '../../../../utils/VSCodeApi'
import { useConfig } from '../../../../utils/useConfig'

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
    onSubmit: (editorValue: SerializedPromptEditorValue) => void
    onStop: () => void

    isFirstInteraction?: boolean
    isLastInteraction?: boolean
    isEditorInitiallyFocused?: boolean

    className?: string
    editorRef?: React.RefObject<PromptEditorRefAPI | null>

    /** For use in storybooks only. */
    __storybook__focus?: boolean
}

/**
 * A component that displays a chat message from the human.
 */
export const HumanMessageCell: FC<HumanMessageCellProps> = ({ message, ...otherProps }) => {
    const messageJSON = JSON.stringify(message)

    const initialEditorState = useMemo(
        () => serializedPromptEditorStateFromChatMessage(JSON.parse(messageJSON)),
        [messageJSON]
    )

    return (
        <HumanMessageCellContent
            {...otherProps}
            initialEditorState={initialEditorState}
            intent={message.intent}
        />
    )
}

type HumanMessageCellContent = {
    initialEditorState: SerializedPromptEditorState
    intent: ChatMessage['intent']
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
    } = props

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
            cellAction={isFirstMessage && <OpenInNewEditorAction />}
            content={
                <HumanMessageEditor
                    models={models}
                    userInfo={userInfo}
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
                    disabled={!chatEnabled}
                    isFirstInteraction={isFirstInteraction}
                    isLastInteraction={isLastInteraction}
                    isEditorInitiallyFocused={isEditorInitiallyFocused}
                    editorRef={editorRef}
                    __storybook__focus={__storybook__focus}
                    onEditorFocusChange={onEditorFocusChange}
                    initialIntent={intent}
                />
            }
            className={className}
        />
    )
}, isEqual)

const OpenInNewEditorAction = () => {
    const {
        config: { multipleWebviewsEnabled },
    } = useConfig()

    if (!multipleWebviewsEnabled) {
        return null
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    onClick={() => {
                        getVSCodeAPI().postMessage({
                            command: 'command',
                            id: 'cody.chat.moveToEditor',
                        })
                    }}
                    className="tw-flex tw-gap-3 tw-items-center tw-leading-none tw-opacity-80 hover:tw-opacity-100 tw-border-b-[1px] tw-border-transparent tw-transition tw-translate-y-[1px]"
                >
                    <ColumnsIcon size={16} strokeWidth={1.25} className="tw-w-8 tw-h-8" />
                </button>
            </TooltipTrigger>
            <TooltipContent>Open in Editor</TooltipContent>
        </Tooltip>
    )
}
