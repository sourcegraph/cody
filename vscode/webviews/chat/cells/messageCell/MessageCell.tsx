import {
    type ChatMessage,
    type Guardrails,
    type ModelProvider,
    ps,
    reformatBotMessageForChat,
} from '@sourcegraph/cody-shared'
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'
import type { ComponentProps, FunctionComponent } from 'react'
import type { ApiPostMessage, UserAccountInfo } from '../../../Chat'
import { serializedPromptEditorStateFromChatMessage } from '../../../promptEditor/PromptEditor'
import { getVSCodeAPI } from '../../../utils/VSCodeApi'
import { ChatMessageContent, type CodeBlockActionsProps } from '../../ChatMessageContent'
import { ErrorItem, RequestErrorItem } from '../../ErrorItem'
import { FeedbackButtons } from '../../components/FeedbackButtons'
import { LoadingDots } from '../../components/LoadingDots'
import { Cell } from '../Cell'
import styles from './MessageCell.module.css'
import { SpeakerIcon } from './SpeakerIcon'

export const MessageCell: FunctionComponent<{
    message: ChatMessage
    messageIndexInTranscript: number
    chatModel: ModelProvider | undefined
    isLoading: boolean
    disabled?: boolean

    showEditButton: boolean
    beingEdited: number | undefined
    setBeingEdited: (index?: number) => void

    showFeedbackButtons: boolean
    feedbackButtonsOnSubmit?: (text: string) => void

    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']

    postMessage?: ApiPostMessage
    userInfo: UserAccountInfo
    guardrails?: Guardrails
}> = ({
    message,
    messageIndexInTranscript,
    chatModel,
    isLoading,
    disabled,
    showEditButton,
    beingEdited,
    setBeingEdited,
    showFeedbackButtons,
    feedbackButtonsOnSubmit,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    postMessage,
    userInfo,
    guardrails,
}) => {
    /** A boolean that determines if any message is currently being edited. */
    const isInEditingMode = beingEdited !== undefined

    /** A boolean indicating whether the current transcript item is the one being edited. */
    const isItemBeingEdited = beingEdited === messageIndexInTranscript

    const displayMarkdown = useDisplayMarkdown(message)

    return (
        <Cell
            style={message.speaker === 'human' ? 'human' : 'assistant'}
            gutterIcon={
                <SpeakerIcon message={message} userInfo={userInfo} chatModel={chatModel} size={24} />
            }
            disabled={disabled}
            containerClassName={classNames(styles.cellContainer, {
                [styles.focused]: isItemBeingEdited,
                [styles.disabled]: disabled,
            })}
            data-testid="message"
        >
            <div className={classNames(message.speaker === 'human' && styles.humanMessageContainer)}>
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
                            isLoading={isLoading}
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
                {showEditButton && (
                    <EditButton
                        className={styles.editButton}
                        tabIndex={isInEditingMode ? -1 : undefined}
                        aria-hidden={isInEditingMode}
                        messageBeingEdited={messageIndexInTranscript}
                        setMessageBeingEdited={setBeingEdited}
                        disabled={isInEditingMode}
                    />
                )}
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

const EditButton: React.FunctionComponent<
    {
        className: string
        disabled?: boolean
        messageBeingEdited: number | undefined
        setMessageBeingEdited: (index?: number) => void
    } & Pick<ComponentProps<typeof VSCodeButton>, 'aria-hidden' | 'tabIndex'>
> = ({
    className,
    messageBeingEdited,
    setMessageBeingEdited,
    disabled,
    'aria-hidden': ariaHidden,
    tabIndex,
}) => (
    <VSCodeButton
        className={className}
        appearance="icon"
        title={disabled ? 'Cannot Edit Command' : 'Edit Your Message'}
        type="button"
        disabled={disabled}
        aria-hidden={ariaHidden}
        tabIndex={tabIndex}
        onClick={() => {
            setMessageBeingEdited(messageBeingEdited)
            getVSCodeAPI().postMessage({
                command: 'event',
                eventName: 'CodyVSCodeExtension:chatEditButton:clicked',
                properties: { source: 'chat' },
            })
        }}
    >
        <i className="codicon codicon-edit" />
    </VSCodeButton>
)

/**
 * React hook for returning the Markdown for rendering a chat message's text.
 */
function useDisplayMarkdown(message: ChatMessage): string {
    if (message.speaker === 'assistant') {
        return reformatBotMessageForChat(message.text ?? ps``).toString()
    }
    return serializedPromptEditorStateFromChatMessage(message).html
}
