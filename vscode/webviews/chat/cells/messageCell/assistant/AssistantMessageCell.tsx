import {
    type ChatMessage,
    type Guardrails,
    ps,
    reformatBotMessageForChat,
} from '@sourcegraph/cody-shared'
import { type FunctionComponent, useEffect, useMemo, useRef } from 'react'
import type { ApiPostMessage, UserAccountInfo } from '../../../../Chat'
import { chatModelIconComponent } from '../../../../components/ChatModelIcon'
import { ChatMessageContent, type CodeBlockActionsProps } from '../../../ChatMessageContent'
import { ErrorItem, RequestErrorItem } from '../../../ErrorItem'
import { FeedbackButtons } from '../../../components/FeedbackButtons'
import { LoadingDots } from '../../../components/LoadingDots'
import { useChatModelByID } from '../../../models/chatModelContext'
import { BaseMessageCell } from '../BaseMessageCell'

/**
 * A component that displays a chat message from the assistant.
 */
export const AssistantMessageCell: FunctionComponent<{
    message: ChatMessage
    userInfo: UserAccountInfo
    isLoading: boolean
    disabled?: boolean

    showFeedbackButtons: boolean
    feedbackButtonsOnSubmit?: (text: string) => void

    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']

    postMessage?: ApiPostMessage
    guardrails?: Guardrails
}> = ({
    message,
    userInfo,
    isLoading,
    disabled,
    showFeedbackButtons,
    feedbackButtonsOnSubmit,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    postMessage,
    guardrails,
}) => {
    const displayMarkdown = useMemo(
        () => reformatBotMessageForChat(message.text ?? ps``).toString(),
        [message]
    )

    const chatModel = useChatModelByID(message.model)
    const ModelIcon = chatModel ? chatModelIconComponent(chatModel.model) : null

    // If this message is in progress and it's out of the viewport when it first appears, scroll to
    // make it visible or else the user might not realize there is a message streaming in below
    // their viewport.
    const someRef = useRef<HTMLElement | null>(null)
    useEffect(() => {
        if (isLoading) {
            someRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
    }, [isLoading])

    return (
        <BaseMessageCell
            speaker={message.speaker}
            speakerIcon={
                chatModel && ModelIcon ? (
                    <span title={`${chatModel.title} by ${chatModel.provider}`} ref={someRef}>
                        <ModelIcon size={20} />
                    </span>
                ) : null
            }
            content={
                <>
                    {message.error ? (
                        typeof message.error === 'string' ? (
                            <RequestErrorItem error={message.error} />
                        ) : (
                            <ErrorItem
                                error={message.error}
                                userInfo={userInfo}
                                postMessage={postMessage}
                            />
                        )
                    ) : null}
                    {displayMarkdown ? (
                        <ChatMessageContent
                            displayMarkdown={displayMarkdown}
                            wrapLinksWithCodyCommand={true}
                            copyButtonOnSubmit={copyButtonOnSubmit}
                            insertButtonOnSubmit={insertButtonOnSubmit}
                            guardrails={guardrails}
                        />
                    ) : (
                        isLoading && <LoadingDots />
                    )}
                </>
            }
            footer={
                showFeedbackButtons &&
                feedbackButtonsOnSubmit && (
                    <FeedbackButtons feedbackButtonsOnSubmit={feedbackButtonsOnSubmit} />
                )
            }
            disabled={disabled}
        />
    )
}
