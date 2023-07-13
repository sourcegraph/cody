import React, { useState } from 'react'

import { mdiCodeJson } from '@mdi/js'
import classNames from 'classnames'

import { ChatMessage, pluralize } from '@sourcegraph/cody-shared'

import {
    ChatButtonProps,
    ChatUISubmitButtonProps,
    ChatUITextAreaProps,
    CopyButtonProps,
    EditButtonProps,
    FeedbackButtonsProps,
} from '../Chat'

import { TranscriptAction } from './actions/TranscriptAction'
import { BlinkingCursor } from './BlinkingCursor'
import { CodeBlocks } from './CodeBlocks'
import { ContextFiles, FileLinkProps } from './ContextFiles'

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
        textAreaComponent?: React.FunctionComponent<ChatUITextAreaProps>
        EditButtonContainer?: React.FunctionComponent<EditButtonProps>
        editButtonOnSubmit?: (text: string) => void
        showEditButton: boolean
        FeedbackButtonsContainer?: React.FunctionComponent<FeedbackButtonsProps>
        feedbackButtonsOnSubmit?: (text: string) => void
        showFeedbackButtons: boolean
        copyButtonOnSubmit?: CopyButtonProps['copyButtonOnSubmit']
        submitButtonComponent?: React.FunctionComponent<ChatUISubmitButtonProps>
        abortMessageInProgressComponent?: React.FunctionComponent<{ onAbortMessageInProgress: () => void }>
        onAbortMessageInProgress?: () => void
        ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
    } & TranscriptItemClassNames
> = React.memo(function TranscriptItemContent({
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
    textAreaComponent: TextArea,
    EditButtonContainer,
    editButtonOnSubmit,
    showEditButton,
    FeedbackButtonsContainer,
    feedbackButtonsOnSubmit,
    showFeedbackButtons,
    copyButtonOnSubmit,
    submitButtonComponent: SubmitButton,
    chatInputClassName,
    ChatButtonComponent,
}) {
    const [formInput, setFormInput] = useState<string>(message.displayText ?? '')
    const textarea =
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
                />
                <SubmitButton
                    className={styles.submitButton}
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
            {/* display edit buttons on last user message, feedback buttons on last assistant message only */}
            {EditButtonContainer && beingEdited && <p className={classNames(styles.editingLabel)}>Editing...</p>}
            {showEditButton && EditButtonContainer && editButtonOnSubmit && TextArea && message.speaker === 'human' && (
                <header
                    className={classNames(
                        beingEdited ? styles.editingContainer : styles.headerContainer,
                        transcriptItemParticipantClassName
                    )}
                >
                    <EditButtonContainer
                        className={styles.FeedbackEditButtonsContainer}
                        messageBeingEdited={beingEdited}
                        setMessageBeingEdited={setBeingEdited}
                    />
                </header>
            )}
            {message.contextFiles && message.contextFiles.length > 0 && (
                <div className={styles.actions}>
                    <ContextFiles
                        contextFiles={message.contextFiles}
                        fileLinkComponent={fileLinkComponent}
                        className={transcriptActionClassName}
                    />
                </div>
            )}
            {message.pluginsContext && message.pluginsContext.length > 0 && (
                <div className={styles.actions}>
                    <TranscriptAction
                        title={{
                            verb: 'Used',
                            object: `${message.pluginsContext.length} ${pluralize(
                                'plugin',
                                message.pluginsContext.length
                            )}`,
                        }}
                        steps={[
                            ...message.pluginsContext.map(item => ({
                                verb: '',
                                object: (
                                    <div>
                                        {item.dataSourceParameters ? (
                                            <pre className={styles.pluginContextItem}>
                                                {JSON.stringify(
                                                    {
                                                        function: item.dataSourceName,
                                                        parameters: item.dataSourceParameters,
                                                        response: item.context,
                                                    },
                                                    null,
                                                    2
                                                )}
                                            </pre>
                                        ) : (
                                            <>
                                                <p>from "{item.pluginName}" got:</p>
                                                <pre className={styles.pluginContextItem}>
                                                    {JSON.stringify(item.context, null, 2)}
                                                </pre>
                                            </>
                                        )}
                                    </div>
                                ),
                                icon: mdiCodeJson,
                            })),
                        ]}
                        className={transcriptActionClassName}
                    />
                </div>
            )}
            <div
                className={classNames(
                    styles.contentPadding,
                    textarea ? undefined : styles.content,
                    inProgress && styles.rowInProgress
                )}
            >
                {message.displayText ? (
                    textarea ?? (
                        <CodeBlocks
                            displayText={message.displayText}
                            copyButtonClassName={codeBlocksCopyButtonClassName}
                            CopyButtonProps={copyButtonOnSubmit}
                            insertButtonClassName={codeBlocksInsertButtonClassName}
                        />
                    )
                ) : inProgress ? (
                    <BlinkingCursor />
                ) : null}
            </div>
            {message.buttons?.length && ChatButtonComponent && (
                <div className={styles.actions}>{message.buttons.map(ChatButtonComponent)}</div>
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
