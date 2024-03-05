import React from 'react'

import classNames from 'classnames'

import type { ChatMessage, Guardrails } from '@sourcegraph/cody-shared'

import type { UserAccountInfo } from '../Chat'
import type { ChatButtonProps } from '../Chat'
import type { EditButtonProps } from '../Chat'
import type { FeedbackButtonsProps } from '../Chat'
import type { ApiPostMessage } from '../Chat'
import type { CodeBlockActionsProps } from './CodeBlocks'

import { BlinkingCursor, LoadingContext } from './BlinkingCursor'
import { CodeBlocks } from './CodeBlocks'
import { ErrorItem, RequestErrorItem } from './ErrorItem'
import { EnhancedContext, type FileLinkProps } from './components/EnhancedContext'

import styles from './TranscriptItem.module.css'

/**
 * CSS class names used for the {@link TranscriptItem} component.
 */
export interface TranscriptItemClassNames {
    transcriptItemClassName?: string
    humanTranscriptItemClassName?: string
    transcriptItemParticipantClassName?: string
    codeBlocksCopyButtonClassName?: string
    codeBlocksInsertButtonClassName?: string
    transcriptActionClassName?: string
}

/**
 * A single message in the chat trans cript.
 */
export const TranscriptItem: React.FunctionComponent<
    {
        index: number
        message: ChatMessage
        inProgress: boolean
        beingEdited: number | undefined
        setBeingEdited: (index?: number) => void
        EditButtonContainer?: React.FunctionComponent<EditButtonProps>
        showEditButton: boolean
        fileLinkComponent: React.FunctionComponent<FileLinkProps>
        FeedbackButtonsContainer?: React.FunctionComponent<FeedbackButtonsProps>
        feedbackButtonsOnSubmit?: (text: string) => void
        showFeedbackButtons: boolean
        copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
        insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
        abortMessageInProgressComponent?: React.FunctionComponent<{
            onAbortMessageInProgress: () => void
        }>
        onAbortMessageInProgress?: () => void
        ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
        userInfo: UserAccountInfo
        postMessage?: ApiPostMessage
        guardrails?: Guardrails
    } & TranscriptItemClassNames
> = React.memo(function TranscriptItemContent({
    index,
    message,
    inProgress,
    beingEdited,
    setBeingEdited,
    fileLinkComponent,
    transcriptItemClassName,
    humanTranscriptItemClassName,
    transcriptItemParticipantClassName,
    codeBlocksCopyButtonClassName,
    codeBlocksInsertButtonClassName,
    transcriptActionClassName,
    EditButtonContainer,
    showEditButton,
    FeedbackButtonsContainer,
    feedbackButtonsOnSubmit,
    showFeedbackButtons,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    ChatButtonComponent,
    userInfo,
    postMessage,
    guardrails,
}) {
    // A boolean indicating whether the message was sent by a human speaker.
    const isHumanMessage = message.speaker === 'human'
    // A boolean that determines if any message is currently being edited.
    const isInEditingMode = beingEdited !== undefined
    // A boolean indicating whether the current transcript item is the one being edited.
    const isItemBeingEdited = beingEdited === index

    return (
        <div
            className={classNames(
                styles.row,
                transcriptItemClassName,
                isHumanMessage ? humanTranscriptItemClassName : styles.assistantRow,
                // When editing a message, all other messages (both human and assistant messages) are blurred (unfocused)
                // except for the current message (transcript item) that is being edited (focused)
                isInEditingMode && (!isHumanMessage || !isItemBeingEdited) && styles.unfocused,
                isItemBeingEdited && styles.focused
            )}
        >
            {/* Edit button shows up on all human messages, but are hidden during Editing Mode*/}
            {showEditButton && EditButtonContainer && (
                <div
                    className={classNames(
                        styles.editingButtonContainer,
                        isInEditingMode && styles.editingButtonContainerIsEditingMode
                    )}
                    tabIndex={isInEditingMode ? -1 : undefined}
                    aria-hidden={isInEditingMode}
                >
                    <header
                        className={classNames(
                            styles.transcriptItemHeader,
                            transcriptItemParticipantClassName
                        )}
                    >
                        <EditButtonContainer
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
                    <ErrorItem
                        error={message.error}
                        ChatButtonComponent={ChatButtonComponent}
                        userInfo={userInfo}
                        postMessage={postMessage}
                    />
                )
            ) : null}
            <div className={classNames(styles.contentPadding, styles.content)}>
                {message.displayText ? (
                    <CodeBlocks
                        displayText={message.displayText}
                        copyButtonClassName={codeBlocksCopyButtonClassName}
                        copyButtonOnSubmit={copyButtonOnSubmit}
                        insertButtonClassName={codeBlocksInsertButtonClassName}
                        insertButtonOnSubmit={insertButtonOnSubmit}
                        metadata={message.metadata}
                        guardrails={guardrails}
                    />
                ) : (
                    inProgress && <BlinkingCursor />
                )}
            </div>
            {/* Enhanced Context list shows up on human message only */}
            {isHumanMessage && (
                <div className={styles.contextFilesContainer}>
                    {message.contextFiles && message.contextFiles.length > 0 ? (
                        <EnhancedContext
                            contextFiles={message.contextFiles}
                            fileLinkComponent={fileLinkComponent}
                            className={transcriptActionClassName}
                        />
                    ) : (
                        inProgress && <LoadingContext />
                    )}
                </div>
            )}
            {/* Display feedback buttons on assistant messages only */}
            {!isHumanMessage &&
                showFeedbackButtons &&
                FeedbackButtonsContainer &&
                feedbackButtonsOnSubmit && (
                    <footer
                        className={classNames(
                            styles.footerContainer,
                            transcriptItemParticipantClassName
                        )}
                    >
                        {/* display edit buttons on last user message, feedback buttons on last assistant message only */}
                        {/* Hide the feedback buttons during editing mode */}
                        <FeedbackButtonsContainer
                            className={styles.feedbackEditButtonsContainer}
                            feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                        />
                    </footer>
                )}
        </div>
    )
})
