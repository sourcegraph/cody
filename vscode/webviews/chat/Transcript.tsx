import type React from 'react'
import { useEffect, useMemo, useRef } from 'react'

import classNames from 'classnames'

import {
    type ChatMessage,
    type Guardrails,
    type ModelProvider,
    isDefined,
} from '@sourcegraph/cody-shared'

import type { UserAccountInfo } from '../Chat'
import type { ApiPostMessage } from '../Chat'
import type { CodeBlockActionsProps } from './ChatMessageContent'

import { TranscriptItem } from './TranscriptItem'

import { ChatModelDropdownMenu } from '../Components/ChatModelDropdownMenu'
import styles from './Transcript.module.css'

export const Transcript: React.FunctionComponent<{
    transcript: ChatMessage[]
    welcomeMessage?: string
    messageInProgress: ChatMessage | null
    messageBeingEdited: number | undefined
    setMessageBeingEdited: (index?: number) => void
    className?: string
    feedbackButtonsOnSubmit?: (text: string) => void
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
    isTranscriptError?: boolean
    chatModels?: ModelProvider[]
    onCurrentChatModelChange: (model: ModelProvider) => void
    userInfo: UserAccountInfo
    postMessage?: ApiPostMessage
    guardrails?: Guardrails
}> = ({
    transcript,
    welcomeMessage,
    messageInProgress,
    messageBeingEdited,
    setMessageBeingEdited,
    className,
    feedbackButtonsOnSubmit,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    isTranscriptError,
    chatModels,
    onCurrentChatModelChange,
    userInfo,
    postMessage,
    guardrails,
}) => {
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
        message => message.speaker === 'human' && message.text !== undefined
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
            if (!message.text && !message.error) {
                return null
            }
            const offsetIndex = index + offset === earlierMessages.length
            const keyIndex = index + offset

            const isItemBeingEdited = messageBeingEdited === keyIndex

            return (
                <div key={index}>
                    {isItemBeingEdited && <div ref={itemBeingEditedRef} />}
                    <TranscriptItem
                        index={keyIndex}
                        key={keyIndex}
                        message={message}
                        inProgress={Boolean(
                            offsetIndex &&
                                messageInProgress &&
                                messageInProgress.speaker === 'assistant' &&
                                !messageInProgress.text
                        )}
                        showEditButton={message.speaker === 'human'}
                        beingEdited={messageBeingEdited}
                        setBeingEdited={setMessageBeingEdited}
                        feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                        copyButtonOnSubmit={copyButtonOnSubmit}
                        insertButtonOnSubmit={insertButtonOnSubmit}
                        showFeedbackButtons={index !== 0 && !isTranscriptError && !message.error}
                        userInfo={userInfo}
                        postMessage={postMessage}
                        guardrails={guardrails}
                    />
                </div>
            )
        }

    const welcomeTranscriptMessage = useMemo(
        (): ChatMessage => ({ speaker: 'assistant', text: welcomeText({ welcomeMessage }) }),
        [welcomeMessage]
    )

    return (
        <div ref={transcriptContainerRef} className={classNames(className, styles.container)}>
            <div ref={scrollAnchoredContainerRef} className={classNames(styles.scrollAnchoredContainer)}>
                {!!chatModels?.length &&
                    onCurrentChatModelChange &&
                    userInfo &&
                    userInfo.isDotComUser && (
                        <ChatModelDropdownMenu
                            models={chatModels}
                            disabled={transcript.length > 0}
                            onCurrentChatModelChange={onCurrentChatModelChange}
                            userInfo={userInfo}
                        />
                    )}
                {transcript.length === 0 && (
                    // Show welcome message only when the chat is empty.
                    <TranscriptItem
                        index={0}
                        message={welcomeTranscriptMessage}
                        beingEdited={undefined}
                        inProgress={false}
                        setBeingEdited={() => {}}
                        showEditButton={false}
                        showFeedbackButtons={false}
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
                        showEditButton={false}
                        showFeedbackButtons={false}
                        copyButtonOnSubmit={copyButtonOnSubmit}
                        insertButtonOnSubmit={insertButtonOnSubmit}
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
}

function findLastIndex<T>(array: T[], predicate: (value: T) => boolean): number {
    for (let i = array.length - 1; i >= 0; i--) {
        if (predicate(array[i])) {
            return i
        }
    }
    return -1
}

interface WelcomeTextOptions {
    /** Provide users with a way to quickly access Cody docs/help.*/
    helpMarkdown?: string
    /** Provide additional content to supplement the original message. Example: tips, privacy policy. */
    welcomeMessage?: string
}

function welcomeText({
    helpMarkdown = 'See [Cody documentation](https://sourcegraph.com/docs/cody) for help and tips.',
    welcomeMessage,
}: WelcomeTextOptions): string {
    return [helpMarkdown, welcomeMessage].filter(isDefined).join('\n\n')
}
