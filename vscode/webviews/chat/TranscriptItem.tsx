import type React from 'react'

import classNames from 'classnames'

import { type ChatMessage, type Guardrails, reformatBotMessageForChat } from '@sourcegraph/cody-shared'

import type { UserAccountInfo } from '../Chat'
import type { ApiPostMessage } from '../Chat'
import { BlinkingCursor, LoadingContext } from './BlinkingCursor'
import { ChatMessageContent, type CodeBlockActionsProps } from './ChatMessageContent'
import { ErrorItem, RequestErrorItem } from './ErrorItem'
import { EnhancedContext } from './components/EnhancedContext'

import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import { serializedPromptEditorStateFromChatMessage } from '../promptEditor/PromptEditor'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import styles from './TranscriptItem.module.css'
import { FeedbackButtons } from './components/FeedbackButtons'

/**
 * A single message in the chat trans cript.
 */
export const TranscriptItem: React.FunctionComponent<{
    index: number
    message: ChatMessage
    inProgress: boolean
    beingEdited: number | undefined
    setBeingEdited: (index?: number) => void
    showEditButton: boolean
    feedbackButtonsOnSubmit?: (text: string) => void
    showFeedbackButtons: boolean
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
    userInfo: UserAccountInfo
    postMessage?: ApiPostMessage
    guardrails?: Guardrails
}> = ({
    index,
    message,
    inProgress,
    beingEdited,
    setBeingEdited,
    showEditButton,
    feedbackButtonsOnSubmit,
    showFeedbackButtons,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    userInfo,
    postMessage,
    guardrails,
}) => {
    // A boolean indicating whether the message was sent by a human speaker.
    const isHumanMessage = message.speaker === 'human'
    // A boolean that determines if any message is currently being edited.
    const isInEditingMode = beingEdited !== undefined
    // A boolean indicating whether the current transcript item is the one being edited.
    const isItemBeingEdited = beingEdited === index

    const displayMarkdown = useDisplayMarkdown(message)

    return (
        <div
            className={classNames(
                styles.row,
                isHumanMessage ? styles.humanRow : styles.assistantRow,
                // When editing a message, all other messages (both human and assistant messages) are blurred (unfocused)
                // except for the current message (transcript item) that is being edited (focused)
                isInEditingMode && (!isHumanMessage || !isItemBeingEdited) && styles.unfocused,
                isItemBeingEdited && styles.focused
            )}
        >
            {/* Edit button shows up on all human messages, but are hidden during Editing Mode*/}
            {showEditButton && (
                <div
                    className={classNames(
                        styles.editingButtonContainer,
                        isInEditingMode && styles.editingButtonContainerIsEditingMode
                    )}
                    tabIndex={isInEditingMode ? -1 : undefined}
                    aria-hidden={isInEditingMode}
                >
                    <header className={styles.transcriptItemHeader}>
                        <EditButton
                            className={styles.feedbackEditButtonsContainer}
                            messageBeingEdited={index}
                            setMessageBeingEdited={setBeingEdited}
                            disabled={isInEditingMode}
                        />
                    </header>
                </div>
            )}
            {message.error ? (
                typeof message.error === 'string' ? (
                    <RequestErrorItem error={message.error} />
                ) : (
                    <ErrorItem error={message.error} userInfo={userInfo} postMessage={postMessage} />
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
                inProgress && <BlinkingCursor />
            )}
            {/* Enhanced Context list shows up on human message only */}
            {isHumanMessage && (
                <div className={styles.contextFilesContainer}>
                    {message.contextFiles && message.contextFiles.length > 0 ? (
                        <EnhancedContext contextFiles={message.contextFiles} />
                    ) : (
                        inProgress && <LoadingContext />
                    )}
                </div>
            )}
            {/* Display feedback buttons on assistant messages only */}
            {!isHumanMessage && showFeedbackButtons && feedbackButtonsOnSubmit && (
                <footer className={styles.footerContainer}>
                    <FeedbackButtons
                        className={styles.feedbackEditButtonsContainer}
                        feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                    />
                </footer>
            )}
        </div>
    )
}

const EditButton: React.FunctionComponent<{
    className: string
    disabled?: boolean
    messageBeingEdited: number | undefined
    setMessageBeingEdited: (index?: number) => void
}> = ({ className, messageBeingEdited, setMessageBeingEdited, disabled }) => (
    <VSCodeButton
        className={classNames(styles.editButton, className)}
        appearance="icon"
        title={disabled ? 'Cannot Edit Command' : 'Edit Your Message'}
        type="button"
        disabled={disabled}
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
        return reformatBotMessageForChat(message.text ?? '')
    }
    return serializedPromptEditorStateFromChatMessage(message).html
}
