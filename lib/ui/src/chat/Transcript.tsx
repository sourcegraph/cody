import React, { useEffect, useRef } from 'react'

import classNames from 'classnames'

import { ChatMessage } from '@sourcegraph/cody-shared'

import {
    ChatButtonProps,
    ChatUISubmitButtonProps,
    ChatUITextAreaProps,
    CopyButtonProps,
    EditButtonProps,
    FeedbackButtonsProps,
} from '../Chat'

import { FileLinkProps } from './ContextFiles'
import { SymbolLinkProps } from './PreciseContext'
import { TranscriptItem, TranscriptItemClassNames } from './TranscriptItem'

import styles from './Transcript.module.css'

export const Transcript: React.FunctionComponent<
    {
        transcript: ChatMessage[]
        messageInProgress: ChatMessage | null
        messageBeingEdited: boolean
        setMessageBeingEdited: (input: boolean) => void
        fileLinkComponent: React.FunctionComponent<FileLinkProps>
        symbolLinkComponent: React.FunctionComponent<SymbolLinkProps>
        className?: string
        textAreaComponent?: React.FunctionComponent<ChatUITextAreaProps>
        EditButtonContainer?: React.FunctionComponent<EditButtonProps>
        editButtonOnSubmit?: (text: string) => void
        FeedbackButtonsContainer?: React.FunctionComponent<FeedbackButtonsProps>
        feedbackButtonsOnSubmit?: (text: string) => void
        copyButtonOnSubmit?: CopyButtonProps['copyButtonOnSubmit']
        submitButtonComponent?: React.FunctionComponent<ChatUISubmitButtonProps>
        ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
        pluginsDevMode?: boolean
        isTranscriptError?: boolean
    } & TranscriptItemClassNames
> = React.memo(function TranscriptContent({
    transcript,
    messageInProgress,
    messageBeingEdited,
    setMessageBeingEdited,
    fileLinkComponent,
    symbolLinkComponent,
    className,
    codeBlocksCopyButtonClassName,
    codeBlocksInsertButtonClassName,
    transcriptItemClassName,
    humanTranscriptItemClassName,
    transcriptItemParticipantClassName,
    transcriptActionClassName,
    textAreaComponent,
    EditButtonContainer,
    editButtonOnSubmit,
    FeedbackButtonsContainer,
    feedbackButtonsOnSubmit,
    copyButtonOnSubmit,
    submitButtonComponent,
    chatInputClassName,
    ChatButtonComponent,
    pluginsDevMode,
    isTranscriptError,
}) {
    // Scroll down whenever a new human message is received as input.
    const transcriptContainerRef = useRef<HTMLDivElement>(null)
    const scrollAnchoredContainerRef = useRef<HTMLDivElement>(null)
    const humanMessageCount = transcript.filter(message => message.speaker === 'human').length
    useEffect(() => {
        if (transcriptContainerRef.current) {
            transcriptContainerRef.current?.scrollTo({
                top: transcriptContainerRef.current.scrollHeight,
                behavior: 'smooth',
            })
        }
    }, [humanMessageCount, transcriptContainerRef])

    // When the content was not scrollable, then becomes scrollable, manually
    // scroll the anchor into view. This overrides the browser's default
    // behavior of initially anchoring to the top until a scroll occurs.
    useEffect(() => {
        const root = transcriptContainerRef.current
        const container = scrollAnchoredContainerRef.current
        if (!(root && container)) {
            return undefined
        }
        let wasIntersecting = true
        const observer = new IntersectionObserver(
            entries => {
                for (const entry of entries) {
                    if (entry.rootBounds?.width === 0 || entries[0].rootBounds?.height === 0) {
                        // After restoring a pane the root element hasn't been sized yet, and we
                        // trivially overflow it. Ignore this.
                        continue
                    }
                    if (wasIntersecting && !entry.isIntersecting) {
                        root.scrollTo({
                            top: root.scrollHeight,
                            behavior: 'smooth',
                        })
                    }
                    wasIntersecting = entry.isIntersecting
                }
            },
            {
                root,
                threshold: 1,
            }
        )
        observer.observe(container)
        return () => {
            observer.disconnect()
        }
    }, [transcriptContainerRef, scrollAnchoredContainerRef])

    return (
        <div ref={transcriptContainerRef} className={classNames(className, styles.container)}>
            <div ref={scrollAnchoredContainerRef} className={classNames(styles.scrollAnchoredContainer)}>
                {transcript.map(
                    (message, index) =>
                        message?.displayText && (
                            <TranscriptItem
                                // eslint-disable-next-line react/no-array-index-key
                                key={index}
                                message={message}
                                inProgress={false}
                                beingEdited={index > 0 && transcript.length - index === 2 && messageBeingEdited}
                                setBeingEdited={setMessageBeingEdited}
                                fileLinkComponent={fileLinkComponent}
                                symbolLinkComponent={symbolLinkComponent}
                                codeBlocksCopyButtonClassName={codeBlocksCopyButtonClassName}
                                codeBlocksInsertButtonClassName={codeBlocksInsertButtonClassName}
                                transcriptItemClassName={transcriptItemClassName}
                                humanTranscriptItemClassName={humanTranscriptItemClassName}
                                transcriptItemParticipantClassName={transcriptItemParticipantClassName}
                                transcriptActionClassName={transcriptActionClassName}
                                textAreaComponent={textAreaComponent}
                                EditButtonContainer={EditButtonContainer}
                                editButtonOnSubmit={editButtonOnSubmit}
                                showEditButton={index > 0 && transcript.length - index === 2}
                                FeedbackButtonsContainer={FeedbackButtonsContainer}
                                feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                                copyButtonOnSubmit={copyButtonOnSubmit}
                                showFeedbackButtons={index !== 0 && !isTranscriptError}
                                submitButtonComponent={submitButtonComponent}
                                chatInputClassName={chatInputClassName}
                                ChatButtonComponent={ChatButtonComponent}
                                pluginsDevMode={pluginsDevMode}
                            />
                        )
                )}
                {messageInProgress && messageInProgress.speaker === 'assistant' && (
                    <TranscriptItem
                        message={messageInProgress}
                        inProgress={true}
                        beingEdited={false}
                        setBeingEdited={setMessageBeingEdited}
                        fileLinkComponent={fileLinkComponent}
                        symbolLinkComponent={symbolLinkComponent}
                        codeBlocksCopyButtonClassName={codeBlocksCopyButtonClassName}
                        codeBlocksInsertButtonClassName={codeBlocksInsertButtonClassName}
                        transcriptItemClassName={transcriptItemClassName}
                        transcriptItemParticipantClassName={transcriptItemParticipantClassName}
                        transcriptActionClassName={transcriptActionClassName}
                        showEditButton={false}
                        showFeedbackButtons={false}
                        copyButtonOnSubmit={copyButtonOnSubmit}
                        submitButtonComponent={submitButtonComponent}
                        chatInputClassName={chatInputClassName}
                        ChatButtonComponent={ChatButtonComponent}
                    />
                )}
            </div>
            <div className={classNames(styles.scrollAnchor)}>&nbsp;</div>
        </div>
    )
})
