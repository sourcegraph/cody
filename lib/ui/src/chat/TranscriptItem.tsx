import React, { useCallback } from 'react'

import classNames from 'classnames'

import { type ChatMessage, type Guardrails } from '@sourcegraph/cody-shared'

import {
    type ApiPostMessage,
    type ChatButtonProps,
    type ChatUISubmitButtonProps,
    type ChatUITextAreaProps,
    type CodeBlockActionsProps,
    type EditButtonProps,
    type FeedbackButtonsProps,
    type UserAccountInfo,
} from '../Chat'

import { BlinkingCursor, LoadingContext } from './BlinkingCursor'
import { CodeBlocks } from './CodeBlocks'
import { EnhancedContext, type FileLinkProps } from './components/EnhancedContext'
import { ErrorItem, RequestErrorItem } from './ErrorItem'
import { PreciseContexts, type SymbolLinkProps } from './PreciseContext'

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
    chatInputClassName?: string
}

/**
 * A single message in the chat trans cript.
 */
export const TranscriptItem: React.FunctionComponent<
    {
        index: number
        message: ChatMessage
        inProgress: boolean
        beingEdited?: number
        setBeingEdited: (index?: number) => void
        fileLinkComponent: React.FunctionComponent<FileLinkProps>
        symbolLinkComponent: React.FunctionComponent<SymbolLinkProps>
        textAreaComponent?: React.FunctionComponent<ChatUITextAreaProps>
        EditButtonContainer?: React.FunctionComponent<EditButtonProps>
        editButtonOnSubmit?: (text: string, index?: number) => void
        showEditButton: boolean
        FeedbackButtonsContainer?: React.FunctionComponent<FeedbackButtonsProps>
        feedbackButtonsOnSubmit?: (text: string) => void
        showFeedbackButtons: boolean
        copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
        insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
        submitButtonComponent?: React.FunctionComponent<ChatUISubmitButtonProps>
        abortMessageInProgressComponent?: React.FunctionComponent<{ onAbortMessageInProgress: () => void }>
        onAbortMessageInProgress?: () => void
        ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
        userInfo: UserAccountInfo
        postMessage?: ApiPostMessage
        guardrails?: Guardrails
        isEnhancedContextEnabled: boolean
    } & TranscriptItemClassNames
> = React.memo(function TranscriptItemContent({
    index,
    message,
    inProgress,
    beingEdited,
    setBeingEdited,
    fileLinkComponent,
    symbolLinkComponent,
    transcriptItemClassName,
    humanTranscriptItemClassName,
    transcriptItemParticipantClassName,
    codeBlocksCopyButtonClassName,
    codeBlocksInsertButtonClassName,
    transcriptActionClassName,
    textAreaComponent: TextArea,
    EditButtonContainer,
    editButtonOnSubmit,
    showEditButton,
    FeedbackButtonsContainer,
    feedbackButtonsOnSubmit,
    showFeedbackButtons,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    submitButtonComponent: SubmitButton,
    chatInputClassName,
    ChatButtonComponent,
    userInfo,
    postMessage,
    guardrails,
    isEnhancedContextEnabled,
}) {
    // TODO bee clean up

    // To identify if the current message is the one being edited when beingEdit is set
    // This is used to display EditTextArea only for the message that is being edited
    const hasItemBeingEdited = beingEdited !== undefined
    const isItemBeingEdited = beingEdited === index

    const setItemAsBeingEdited = useCallback(
        (status: boolean) => {
            setBeingEdited(status ? index : undefined)
        },
        [index, setBeingEdited]
    )

    return (
        <div
            className={classNames(
                styles.row,
                transcriptItemClassName,
                message.speaker === 'human' ? humanTranscriptItemClassName : styles.assistantRow,
                hasItemBeingEdited && (isItemBeingEdited ? styles.focused : styles.unfocused)
            )}
        >
            {showEditButton && !hasItemBeingEdited && EditButtonContainer && !isItemBeingEdited && TextArea && (
                <div className={styles.editingButtonContainer}>
                    <header className={classNames(styles.transcriptItemHeader, transcriptItemParticipantClassName)}>
                        <EditButtonContainer
                            className={styles.FeedbackEditButtonsContainer}
                            messageBeingEdited={isItemBeingEdited}
                            setMessageBeingEdited={setItemAsBeingEdited}
                        />
                    </header>
                </div>
            )}
            {message.preciseContext && message.preciseContext.length > 0 && (
                <div className={styles.actions}>
                    <PreciseContexts
                        preciseContexts={message.preciseContext}
                        symbolLinkComponent={symbolLinkComponent}
                        className={transcriptActionClassName}
                    />
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
            {message.buttons?.length && ChatButtonComponent && (
                <div className={styles.actions}>{message.buttons.map(ChatButtonComponent)}</div>
            )}
            {!isItemBeingEdited && message.speaker === 'human' && (
                <div className={styles.contextFilesContainer}>
                    {message.contextFiles && message.contextFiles.length > 0 ? (
                        <EnhancedContext
                            contextFiles={message.contextFiles}
                            fileLinkComponent={fileLinkComponent}
                            className={transcriptActionClassName}
                        />
                    ) : (
                        inProgress && <LoadingContext isEnhancedContextEnabled={isEnhancedContextEnabled} />
                    )}
                </div>
            )}
            {showFeedbackButtons &&
                FeedbackButtonsContainer &&
                feedbackButtonsOnSubmit &&
                message.speaker === 'assistant' && (
                    <footer className={classNames(styles.footerContainer, transcriptItemParticipantClassName)}>
                        {/* display edit buttons on last user message, feedback buttons on last assistant message only */}
                        <FeedbackButtonsContainer
                            className={styles.FeedbackEditButtonsContainer}
                            feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                        />
                    </footer>
                )}
        </div>
    )
})
