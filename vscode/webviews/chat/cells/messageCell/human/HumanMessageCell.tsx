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
import { type FC, memo, useMemo, useState } from 'react'
import type { UserAccountInfo } from '../../../../Chat'
import { UserAvatar } from '../../../../components/UserAvatar'
import { BaseMessageCell, MESSAGE_CELL_AVATAR_SIZE } from '../BaseMessageCell'
import { HumanMessageEditor } from './editor/HumanMessageEditor'

import clsx from 'clsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../components/shadcn/ui/tooltip'
import { getVSCodeAPI } from '../../../../utils/VSCodeApi'
import { useConfig } from '../../../../utils/useConfig'

interface HumanMessageCellProps {
    message: ChatMessage
    models: Model[]
    userInfo: UserAccountInfo
    chatEnabled: boolean
    isFirstMessage: boolean
    isSent: boolean
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
    __storybook__focus?: boolean
}

export const HumanMessageCell: FC<HumanMessageCellProps> = ({ message, ...otherProps }) => {
    const messageJSON = JSON.stringify(message)
    const initialEditorState = useMemo(
        () => serializedPromptEditorStateFromChatMessage(JSON.parse(messageJSON)),
        [messageJSON]
    )
    const [imageFile, setImageFile] = useState<File | undefined>()

    return (
        <HumanMessageCellContent
            {...otherProps}
            initialEditorState={initialEditorState}
            intent={message.intent}
            imageFile={imageFile}
            setImageFile={setImageFile}
        />
    )
}

type HumanMessageCellContent = {
    initialEditorState: SerializedPromptEditorState
    intent: ChatMessage['intent']
    imageFile?: File
    setImageFile: (file: File | undefined) => void
} & Omit<HumanMessageCellProps, 'message'>

const HumanMessageCellContent = memo<HumanMessageCellContent>(props => {
    const [isDragging, setIsDragging] = useState(false)

    const handleDragEnter = (event: React.DragEvent) => {
        event.preventDefault()
        event.stopPropagation()
        const items = Array.from(event.dataTransfer.items)
        if (items.some(item => item.type.startsWith('image/'))) {
            setIsDragging(true)
        }
    }

    const handleDragLeave = (event: React.DragEvent) => {
        event.preventDefault()
        event.stopPropagation()
        setIsDragging(false)
    }

    const handleDrop = (event: React.DragEvent) => {
        event.preventDefault()
        event.stopPropagation()
        setIsDragging(false)

        const file = event.dataTransfer.files[0]
        if (file?.type.startsWith('image/')) {
            props.setImageFile(file)
            props.editorRef?.current?.setFocus(true)
        }
    }

    const handleDragOver = (event: React.DragEvent) => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
    }

    return (
        <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={clsx(props.className, {
                'tw-border-2 tw-border-dashed tw-border-focusBorder tw-rounded-md': isDragging,
            })}
        >
            <BaseMessageCell
                speakerIcon={
                    <UserAvatar
                        user={props.userInfo.user}
                        size={MESSAGE_CELL_AVATAR_SIZE}
                        sourcegraphGradientBorder={true}
                    />
                }
                speakerTitle={props.userInfo.user.displayName ?? props.userInfo.user.username}
                cellAction={props.isFirstMessage && <OpenInNewEditorAction />}
                content={
                    <HumanMessageEditor
                        models={props.models}
                        userInfo={props.userInfo}
                        initialEditorState={props.initialEditorState}
                        placeholder={
                            props.isFirstMessage
                                ? 'Ask anything. Use @ to specify context...'
                                : 'Ask a followup...'
                        }
                        isFirstMessage={props.isFirstMessage}
                        isSent={props.isSent}
                        isPendingPriorResponse={props.isPendingPriorResponse}
                        onChange={props.onChange}
                        onSubmit={props.onSubmit}
                        onStop={props.onStop}
                        disabled={!props.chatEnabled}
                        isFirstInteraction={props.isFirstInteraction}
                        isLastInteraction={props.isLastInteraction}
                        isEditorInitiallyFocused={props.isEditorInitiallyFocused}
                        editorRef={props.editorRef}
                        __storybook__focus={props.__storybook__focus}
                        onEditorFocusChange={props.onEditorFocusChange}
                        initialIntent={props.intent}
                        imageFile={props.imageFile}
                        setImageFile={props.setImageFile}
                    />
                }
            />
        </div>
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
                    className="tw-flex tw-gap-3 tw-items-center tw-leading-none tw-transition"
                >
                    <ColumnsIcon size={16} strokeWidth={1.25} className="tw-w-8 tw-h-8" />
                </button>
            </TooltipTrigger>
            <TooltipContent>Open in Editor</TooltipContent>
        </Tooltip>
    )
}
