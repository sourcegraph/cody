import {
    type ChatMessage,
    type Model,
    isAbortErrorOrSocketHangUp,
    reformatBotMessageForChat,
} from '@sourcegraph/cody-shared'
import isEqual from 'lodash/isEqual'
import { type FunctionComponent, memo, useMemo } from 'react'
import type { ApiPostMessage } from '../../../../Chat'
import { ChatMessageContent } from '../../../ChatMessageContent/ChatMessageContent'
import { ErrorItem, RequestErrorItem } from '../../../ErrorItem'
import { LoadingDots } from '../../../components/LoadingDots'
import { BaseMessageCell } from '../BaseMessageCell'
import type { PriorHumanMessageInfo } from './AssistantMessageCell'
import { SubMessageCell } from './SubMessageCell'

/**
 * A component that displays a chat message from the assistant.
 */
export const ToolCodyAssistantMessageCell: FunctionComponent<{
    message: ChatMessage
    models: Model[]
    /** Information about the human message that led to this assistant response. */
    humanMessage: PriorHumanMessageInfo | null

    isLoading: boolean

    postMessage?: ApiPostMessage
    isLastSentInteraction: boolean
}> = memo(
    ({ message, humanMessage, isLoading, postMessage, isLastSentInteraction: isLastInteraction }) => {
        const displayMarkdown = useMemo(
            () => (message.text ? reformatBotMessageForChat(message.text).toString() : ''),
            [message.text]
        )

        const isAborted = isAbortErrorOrSocketHangUp(message.error)

        return (
            <BaseMessageCell
                content={
                    <>
                        {message.error && !isAborted ? (
                            typeof message.error === 'string' ? (
                                <RequestErrorItem error={message.error} />
                            ) : (
                                <ErrorItem
                                    error={message.error}
                                    userInfo={{ isCodyProUser: true, isDotComUser: true }}
                                    postMessage={postMessage}
                                    humanMessage={humanMessage}
                                />
                            )
                        ) : null}
                        {displayMarkdown ? (
                            <ChatMessageContent
                                displayMarkdown={displayMarkdown}
                                isMessageLoading={isLoading}
                                humanMessage={humanMessage}
                            />
                        ) : (
                            isLoading &&
                            (message.subMessages === undefined || message.subMessages.length === 0) && (
                                <div>
                                    <LoadingDots />
                                </div>
                            )
                        )}
                        {message.subMessages?.length &&
                            message.subMessages.length > 0 &&
                            message.subMessages.map((piece, i) => (
                                // biome-ignore lint/suspicious/noArrayIndexKey:
                                <SubMessageCell key={`piece-${i}`} piece={piece} />
                            ))}
                    </>
                }
            />
        )
    },
    isEqual
)
