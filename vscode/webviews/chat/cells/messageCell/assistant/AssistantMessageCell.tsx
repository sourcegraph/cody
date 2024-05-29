import {
    type ChatMessage,
    type Guardrails,
    ps,
    reformatBotMessageForChat,
} from '@sourcegraph/cody-shared'
import { type FunctionComponent, useMemo } from 'react'
import type { ApiPostMessage, UserAccountInfo } from '../../../../Chat'
import { chatModelIconComponent } from '../../../../components/ChatModelIcon'
import { ChatMessageContent, type CodeBlockActionsProps } from '../../../ChatMessageContent'
import { ErrorItem, RequestErrorItem } from '../../../ErrorItem'
import { FeedbackButtons } from '../../../components/FeedbackButtons'
import { LoadingDots } from '../../../components/LoadingDots'
import { useChatModelByID } from '../../../models/chatModelContext'
import { BaseMessageCell, MESSAGE_CELL_AVATAR_SIZE } from '../BaseMessageCell'
import { ContextFocusActions } from './ContextFocusActions'

export interface PriorHumanMessageInfo {
    hasExplicitMentions: boolean
    addEnhancedContext: boolean

    rerunWithEnhancedContext: (withEnhancedContext: boolean) => void
    appendAtMention: () => void
}

/**
 * A component that displays a chat message from the assistant.
 */
export const AssistantMessageCell: FunctionComponent<{
    message: ChatMessage

    /** Information about the human message that led to this assistant response. */
    humanMessage: PriorHumanMessageInfo | null

    userInfo: UserAccountInfo
    isLoading: boolean

    showFeedbackButtons: boolean
    feedbackButtonsOnSubmit?: (text: string) => void

    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']

    postMessage?: ApiPostMessage
    guardrails?: Guardrails
}> = ({
    message,
    humanMessage,
    userInfo,
    isLoading,
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

    return (
        <BaseMessageCell
            speaker={message.speaker}
            speakerIcon={
                chatModel && ModelIcon ? (
                    <span title={`${chatModel.title} by ${chatModel.provider}`}>
                        <ModelIcon size={NON_HUMAN_CELL_AVATAR_SIZE} />
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
                            copyButtonOnSubmit={copyButtonOnSubmit}
                            insertButtonOnSubmit={insertButtonOnSubmit}
                            guardrails={guardrails}
                        />
                    ) : (
                        isLoading && <LoadingDots />
                    )}
                    {humanMessage && (
                        <ContextFocusActions
                            humanMessage={humanMessage}
                            className="tw-mt-3 tw-text-muted-foreground tw-text-sm"
                        />
                    )}
                </>
            }
            footer={
                <>
                    {showFeedbackButtons && feedbackButtonsOnSubmit && (
                        <FeedbackButtons feedbackButtonsOnSubmit={feedbackButtonsOnSubmit} />
                    )}
                </>
            }
        />
    )
}

export const NON_HUMAN_CELL_AVATAR_SIZE =
    MESSAGE_CELL_AVATAR_SIZE * 0.83 /* make them "look" the same size as the human avatar icons */
