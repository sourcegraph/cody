import React, { useState } from 'react'

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
        message: ChatMessage
        inProgress: boolean
        beingEdited: boolean
        setBeingEdited: (input: boolean) => void
        fileLinkComponent: React.FunctionComponent<FileLinkProps>
        symbolLinkComponent: React.FunctionComponent<SymbolLinkProps>
        textAreaComponent?: React.FunctionComponent<ChatUITextAreaProps>
        EditButtonContainer?: React.FunctionComponent<EditButtonProps>
        editButtonOnSubmit?: (text: string) => void
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
    const [formInput, setFormInput] = useState<string>(message.displayText ?? '')
    const EditTextArea =
        TextArea && beingEdited && editButtonOnSubmit && SubmitButton ? (
            <div className={styles.textAreaContainer}>
                <TextArea
                    className={classNames(styles.chatInput, chatInputClassName)}
                    rows={5}
                    value={formInput}
                    autoFocus={true}
                    required={true}
                    onInput={event => setFormInput((event.target as HTMLInputElement).value)}
                    onKeyDown={event => {
                        if (event.key === 'Escape') {
                            setBeingEdited(false)
                        }

                        if (
                            event.key === 'Enter' &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing &&
                            formInput.trim()
                        ) {
                            event.preventDefault()
                            setBeingEdited(false)
                            editButtonOnSubmit(formInput)
                        }
                    }}
                    chatEnabled={true}
                />
                <SubmitButton
                    className={styles.submitButton}
                    isFollowUp={false}
                    onClick={() => {
                        setBeingEdited(false)
                        editButtonOnSubmit(formInput)
                    }}
                    disabled={formInput.length === 0}
                />
            </div>
        ) : null

    return (
        <div
            className={classNames(
                styles.row,
                transcriptItemClassName,
                message.speaker === 'human' ? humanTranscriptItemClassName : styles.assistantRow
            )}
        >
            {showEditButton && EditButtonContainer && editButtonOnSubmit && TextArea && message.speaker === 'human' && (
                <div className={beingEdited ? styles.editingContainer : styles.editingButtonContainer}>
                    <header className={classNames(styles.transcriptItemHeader, transcriptItemParticipantClassName)}>
                        {beingEdited && <p className={classNames(styles.editingLabel)}>Editing...</p>}
                        <EditButtonContainer
                            className={styles.FeedbackEditButtonsContainer}
                            messageBeingEdited={beingEdited}
                            setMessageBeingEdited={setBeingEdited}
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
            <div className={classNames(styles.contentPadding, EditTextArea ? undefined : styles.content)}>
                {message.displayText ? (
                    EditTextArea ? (
                        !inProgress && !message.displayText.startsWith('/') && EditTextArea
                    ) : (
                        <CodeBlocks
                            displayText={message.displayText}
                            copyButtonClassName={codeBlocksCopyButtonClassName}
                            copyButtonOnSubmit={copyButtonOnSubmit}
                            insertButtonClassName={codeBlocksInsertButtonClassName}
                            insertButtonOnSubmit={insertButtonOnSubmit}
                            metadata={message.metadata}
                            guardrails={guardrails}
                        />
                    )
                ) : (
                    inProgress && <BlinkingCursor />
                )}
            </div>
            {message.buttons?.length && ChatButtonComponent && (
                <div className={styles.actions}>{message.buttons.map(ChatButtonComponent)}</div>
            )}
            {message.speaker === 'human' && (
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
