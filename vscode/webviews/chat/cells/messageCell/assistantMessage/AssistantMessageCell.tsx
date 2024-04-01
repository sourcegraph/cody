import { type ChatMessage, type Guardrails, reformatBotMessageForChat } from '@sourcegraph/cody-shared'
import { type FunctionComponent, useMemo } from 'react'
import type { ApiPostMessage, UserAccountInfo } from '../../../../Chat'
import { chatModelIconComponent } from '../../../../Components/ChatModelIcon'
import { ChatMessageContent, type CodeBlockActionsProps } from '../../../ChatMessageContent'
import { ErrorItem, RequestErrorItem } from '../../../ErrorItem'
import { FeedbackButtons } from '../../../components/FeedbackButtons'
import { LoadingDots } from '../../../components/LoadingDots'
import { useCurrentChatModel } from '../../../models/chatModelContext'
import { BaseMessageCell } from '../BaseMessageCell'

/**
 * A component that displays a chat message from the assistant.
 */
export const AssistantMessageCell: FunctionComponent<{
    message: ChatMessage
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
    userInfo,
    isLoading,
    showFeedbackButtons,
    feedbackButtonsOnSubmit,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    postMessage,
    guardrails,
}) => {
    const displayMarkdown = useMemo(() => reformatBotMessageForChat(message.text ?? ''), [message])
    const chatModel = useCurrentChatModel()
    const ModelIcon = chatModel ? chatModelIconComponent(chatModel.model) : null

    return (
        <BaseMessageCell
            speaker={message.speaker}
            speakerIcon={ModelIcon ? <ModelIcon size={20} /> : null}
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
                            wrapLinksWithCodyCommand={message.speaker !== 'human'}
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
        />
    )
}
