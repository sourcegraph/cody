import {
    type ChatMessage,
    type Guardrails,
    type ModelProvider,
    reformatBotMessageForChat,
} from '@sourcegraph/cody-shared'
import type { FunctionComponent } from 'react'
import type { ApiPostMessage, UserAccountInfo } from '../../../Chat'
import { serializedPromptEditorStateFromChatMessage } from '../../../promptEditor/PromptEditor'
import { ChatMessageContent, type CodeBlockActionsProps } from '../../ChatMessageContent'
import { ErrorItem, RequestErrorItem } from '../../ErrorItem'
import { FeedbackButtons } from '../../components/FeedbackButtons'
import { LoadingDots } from '../../components/LoadingDots'
import { Cell } from '../Cell'
import styles from './MessageCell.module.css'
import { SpeakerIcon } from './SpeakerIcon'

// TODO!(sqs): make sure command prompts can't be edited
export const MessageCell: FunctionComponent<{
    message: ChatMessage
    chatModel: ModelProvider | undefined
    isLoading: boolean

    showFeedbackButtons: boolean
    feedbackButtonsOnSubmit?: (text: string) => void

    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']

    postMessage?: ApiPostMessage
    userInfo: UserAccountInfo
    guardrails?: Guardrails
}> = ({
    message,
    chatModel,
    isLoading,
    showFeedbackButtons,
    feedbackButtonsOnSubmit,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    postMessage,
    userInfo,
    guardrails,
}) => {
    const displayMarkdown = useDisplayMarkdown(message)

    return (
        <Cell
            style={message.speaker === 'human' ? 'human' : 'assistant'}
            gutterIcon={
                <SpeakerIcon message={message} userInfo={userInfo} chatModel={chatModel} size={24} />
            }
            containerClassName={styles.cellContainer}
            data-testid="message"
        >
            <div className={styles.messageContentContainer}>
                <div className={styles.messageContent}>
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
                </div>
            </div>
            {message.speaker !== 'human' && showFeedbackButtons && feedbackButtonsOnSubmit && (
                <FeedbackButtons
                    className={styles.feedbackButtons}
                    feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                />
            )}
        </Cell>
    )
}

/**
 * React hook for returning the Markdown for rendering a chat message's text.
 */
function useDisplayMarkdown(message: ChatMessage): string {
    if (message.speaker === 'assistant') {
        return reformatBotMessageForChat(message.text ?? '')
    }
    return serializedPromptEditorStateFromChatMessage(message).html
}
