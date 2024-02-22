import React from 'react'

import classNames from 'classnames'

import type { ChatMessage, Guardrails } from '@sourcegraph/cody-shared'

import type {
    ApiPostMessage,
    ChatButtonProps,
    CodeBlockActionsProps,
    EditButtonProps,
    FeedbackButtonsProps,
    UserAccountInfo,
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
        symbolLinkComponent: React.FunctionComponent<SymbolLinkProps>
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
    symbolLinkComponent,
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

    // TODO (bee) can be removed once we support editing command prompts.
    // A boolean indicating whether the current message is a known command input.
    const isCommandInput =
        message?.displayText?.startsWith('/') || isDefaultCommandPrompts(message?.text)

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
                            disabled={isCommandInput || isInEditingMode}
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
            {/* Enhanced Context list shows up on human message only */}
            {isHumanMessage && (
                <div className={styles.contextFilesContainer}>
                    {message.contextFiles && message.contextFiles.length > 0 ? (
                        <EnhancedContext
                            contextFiles={message.contextFiles}
                            fileLinkComponent={fileLinkComponent}
                            className={transcriptActionClassName}
                            isCommand={isCommandInput}
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

// TODO: TO BE REMOVED
// This is a temporary workaround for disabling editing on the default chat commands.
const commandPrompts = {
    explain:
        'Explain what the selected code does in simple terms. Assume the audience is a beginner programmer who has just learned the language features and basic syntax. Focus on explaining: 1) The purpose of the code 2) What input(s) it takes 3) What output(s) it produces 4) How it achieves its purpose through the logic and algorithm. 5) Any important logic flows or data transformations happening. Use simple language a beginner could understand. Include enough detail to give a full picture of what the code aims to accomplish without getting too technical. Format the explanation in coherent paragraphs, using proper punctuation and grammar. Write the explanation assuming no prior context about the code is known. Do not make assumptions about variables or functions not shown in the shared code. Start the answer with the name of the code that is being explained.',
    smell: `Please review and analyze the selected code and identify potential areas for improvement related to code smells, readability, maintainability, performance, security, etc. Do not list issues already addressed in the given code. Focus on providing up to 5 constructive suggestions that could make the code more robust, efficient, or align with best practices. For each suggestion, provide a brief explanation of the potential benefits. After listing any recommendations, summarize if you found notable opportunities to enhance the code quality overall or if the code generally follows sound design principles. If no issues found, reply 'There are no errors.'`,
}

export function isDefaultCommandPrompts(text?: string): boolean {
    if (!text) {
        return false
    }
    return Object.values(commandPrompts).includes(text)
}
