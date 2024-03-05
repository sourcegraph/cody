import React, { useEffect, useRef } from 'react'

import classNames from 'classnames'

import type { ChatMessage, Guardrails, ModelProvider } from '@sourcegraph/cody-shared'

import type { UserAccountInfo } from '../Chat'
import type { ChatButtonProps } from '../Chat'
import type { EditButtonProps } from '../Chat'
import type { FeedbackButtonsProps } from '../Chat'
import type { ApiPostMessage } from '../Chat'
import type { ChatModelDropdownMenuProps } from '../Components/ChatModelDropdownMenu'
import type { CodeBlockActionsProps } from './CodeBlocks'

import { TranscriptItem, type TranscriptItemClassNames } from './TranscriptItem'
import type { FileLinkProps } from './components/EnhancedContext'

import styles from './Transcript.module.css'

export const Transcript: React.FunctionComponent<
    {
        transcript: ChatMessage[]
        messageInProgress: ChatMessage | null
        messageBeingEdited: number | undefined
        setMessageBeingEdited: (index?: number) => void
        fileLinkComponent: React.FunctionComponent<FileLinkProps>
        className?: string
        EditButtonContainer?: React.FunctionComponent<EditButtonProps>
        FeedbackButtonsContainer?: React.FunctionComponent<FeedbackButtonsProps>
        feedbackButtonsOnSubmit?: (text: string) => void
        copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
        insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
        ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
        isTranscriptError?: boolean
        chatModels?: ModelProvider[]
        ChatModelDropdownMenu?: React.FunctionComponent<ChatModelDropdownMenuProps>
        onCurrentChatModelChange?: (model: ModelProvider) => void
        userInfo: UserAccountInfo
        postMessage?: ApiPostMessage
        guardrails?: Guardrails
    } & TranscriptItemClassNames
> = React.memo(function TranscriptContent({
    transcript,
    messageInProgress,
    messageBeingEdited,
    setMessageBeingEdited,
    fileLinkComponent,
    className,
    codeBlocksCopyButtonClassName,
    codeBlocksInsertButtonClassName,
    transcriptItemClassName,
    humanTranscriptItemClassName,
    transcriptItemParticipantClassName,
    transcriptActionClassName,
    EditButtonContainer,
    FeedbackButtonsContainer,
    feedbackButtonsOnSubmit,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    ChatButtonComponent,
    isTranscriptError,
    chatModels,
    ChatModelDropdownMenu,
    onCurrentChatModelChange,
    userInfo,
    postMessage,
    guardrails,
}) {
    // Scroll the last human message to the top whenever a new human message is received as input.
    const transcriptContainerRef = useRef<HTMLDivElement>(null)
    const scrollAnchoredContainerRef = useRef<HTMLDivElement>(null)
    const lastHumanMessageTopRef = useRef<HTMLDivElement>(null)
    const itemBeingEditedRef = useRef<HTMLDivElement>(null)

    const humanMessageCount = transcript.filter(message => message.speaker === 'human').length
    // biome-ignore lint/correctness/useExhaustiveDependencies: we want this to refresh
    useEffect(() => {
        if (!messageBeingEdited && !transcriptContainerRef?.current) {
            lastHumanMessageTopRef?.current?.scrollIntoView({
                behavior: 'auto',
                block: 'start',
                inline: 'nearest',
            })
        }
    }, [humanMessageCount, messageBeingEdited])

    // Scroll item being edited to view if it's off-screen
    useEffect(() => {
        if (messageBeingEdited === undefined) {
            return
        }
        if (messageBeingEdited !== undefined && itemBeingEditedRef?.current) {
            itemBeingEditedRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
                inline: 'nearest',
            })
            return
        }
    }, [messageBeingEdited])

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
                        lastHumanMessageTopRef.current?.scrollIntoView({
                            behavior: 'auto',
                            block: 'start',
                            inline: 'nearest',
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
    }, [])

    const lastHumanMessageIndex = findLastIndex(
        transcript,
        message => message.speaker === 'human' && message.displayText !== undefined
    )
    let earlierMessages: ChatMessage[] = []
    let lastInteractionMessages = transcript
    if (lastHumanMessageIndex !== -1) {
        earlierMessages = transcript.slice(0, lastHumanMessageIndex)
        lastInteractionMessages = transcript.slice(lastHumanMessageIndex)
    }

    const messageToTranscriptItem =
        (offset: number) =>
        (message: ChatMessage, index: number): JSX.Element | null => {
            if (!message?.displayText && !message.error) {
                return null
            }
            // The key index includes the Cody welcome message added to the transcript in the webview
            // as it is not included in the transcript returned from the server, the key index is
            // offset by 1 to account for this.
            const offsetIndex = index + offset === earlierMessages.length
            const keyIndex = index + offset
            const transcriptIndex = keyIndex - 1

            const isItemBeingEdited = messageBeingEdited === transcriptIndex

            return (
                <div key={index}>
                    {isItemBeingEdited && <div ref={itemBeingEditedRef} />}
                    <TranscriptItem
                        index={transcriptIndex}
                        key={keyIndex}
                        message={message}
                        inProgress={
                            offsetIndex &&
                            messageInProgress?.speaker === 'assistant' &&
                            !messageInProgress?.displayText
                        }
                        showEditButton={message.speaker === 'human'}
                        beingEdited={messageBeingEdited}
                        setBeingEdited={setMessageBeingEdited}
                        EditButtonContainer={EditButtonContainer}
                        fileLinkComponent={fileLinkComponent}
                        codeBlocksCopyButtonClassName={codeBlocksCopyButtonClassName}
                        codeBlocksInsertButtonClassName={codeBlocksInsertButtonClassName}
                        transcriptItemClassName={transcriptItemClassName}
                        humanTranscriptItemClassName={humanTranscriptItemClassName}
                        transcriptItemParticipantClassName={transcriptItemParticipantClassName}
                        transcriptActionClassName={transcriptActionClassName}
                        FeedbackButtonsContainer={FeedbackButtonsContainer}
                        feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                        copyButtonOnSubmit={copyButtonOnSubmit}
                        insertButtonOnSubmit={insertButtonOnSubmit}
                        showFeedbackButtons={index !== 0 && !isTranscriptError && !message.error}
                        ChatButtonComponent={ChatButtonComponent}
                        userInfo={userInfo}
                        postMessage={postMessage}
                        guardrails={guardrails}
                    />
                </div>
            )
        }

    return (
        <div ref={transcriptContainerRef} className={classNames(className, styles.container)}>
            <div ref={scrollAnchoredContainerRef} className={classNames(styles.scrollAnchoredContainer)}>
                {!!chatModels?.length &&
                    ChatModelDropdownMenu &&
                    onCurrentChatModelChange &&
                    userInfo &&
                    userInfo.isDotComUser && (
                        <ChatModelDropdownMenu
                            models={chatModels}
                            disabled={transcript.length > 1}
                            onCurrentChatModelChange={onCurrentChatModelChange}
                            userInfo={userInfo}
                        />
                    )}
                {earlierMessages.map(messageToTranscriptItem(0))}
                <div ref={lastHumanMessageTopRef} />
                {lastInteractionMessages.map(messageToTranscriptItem(earlierMessages.length))}
                {messageInProgress && messageInProgress.speaker === 'assistant' && (
                    <TranscriptItem
                        index={transcript.length}
                        message={messageInProgress}
                        inProgress={!!transcript[earlierMessages.length].contextFiles}
                        beingEdited={messageBeingEdited}
                        setBeingEdited={setMessageBeingEdited}
                        fileLinkComponent={fileLinkComponent}
                        codeBlocksCopyButtonClassName={codeBlocksCopyButtonClassName}
                        codeBlocksInsertButtonClassName={codeBlocksInsertButtonClassName}
                        transcriptItemClassName={transcriptItemClassName}
                        transcriptItemParticipantClassName={transcriptItemParticipantClassName}
                        transcriptActionClassName={transcriptActionClassName}
                        showEditButton={false}
                        showFeedbackButtons={false}
                        copyButtonOnSubmit={copyButtonOnSubmit}
                        insertButtonOnSubmit={insertButtonOnSubmit}
                        ChatButtonComponent={ChatButtonComponent}
                        postMessage={postMessage}
                        userInfo={userInfo}
                    />
                )}
                {messageInProgress && messageInProgress.speaker === 'assistant' && (
                    <div className={styles.rowInProgress} />
                )}
            </div>
            <div className={classNames(styles.scrollAnchor)}>&nbsp;</div>
        </div>
    )
})

function findLastIndex<T>(array: T[], predicate: (value: T) => boolean): number {
    for (let i = array.length - 1; i >= 0; i--) {
        if (predicate(array[i])) {
            return i
        }
    }
    return -1
}
