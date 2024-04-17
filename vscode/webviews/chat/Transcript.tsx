import type React from 'react'
import { type FunctionComponent, useEffect, useRef } from 'react'

import classNames from 'classnames'

import { type ChatMessage, type Guardrails, renderCodyMarkdown } from '@sourcegraph/cody-shared'

import type { UserAccountInfo } from '../Chat'
import type { ApiPostMessage } from '../Chat'
import type { CodeBlockActionsProps } from './ChatMessageContent'

import { ChatModelDropdownMenu } from '../Components/ChatModelDropdownMenu'
import { CodyLogo } from '../icons/CodyLogo'
import styles from './Transcript.module.css'
import { Cell } from './cells/Cell'
import { ContextCell } from './cells/contextCell/ContextCell'
import { MessageCell } from './cells/messageCell/MessageCell'
import { useChatModelContext, useCurrentChatModel } from './models/chatModelContext'

export const Transcript: React.FunctionComponent<{
    transcript: ChatMessage[]
    welcomeMessage?: string
    messageInProgress: ChatMessage | null
    messageBeingEdited: number | undefined
    setMessageBeingEdited: (index?: number) => void
    className?: string
    feedbackButtonsOnSubmit: (text: string) => void
    copyButtonOnSubmit: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit: CodeBlockActionsProps['insertButtonOnSubmit']
    isTranscriptError?: boolean
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

    const { chatModels, onCurrentChatModelChange } = useChatModelContext()
    const chatModel = useCurrentChatModel()

    const messageToTranscriptItem =
        (offset: number) =>
        (message: ChatMessage, index: number): JSX.Element | null => {
            if (!message.text && !message.error) {
                return null
            }
            const offsetIndex = index + offset === earlierMessages.length
            const keyIndex = index + offset

            const isLoading = Boolean(
                offsetIndex &&
                    messageInProgress &&
                    messageInProgress.speaker === 'assistant' &&
                    !messageInProgress.text
            )
            const isLastMessage = keyIndex === transcript.length - 1

            const isItemBeingEdited = messageBeingEdited === keyIndex

            return (
                <div key={index}>
                    {isItemBeingEdited && <div ref={itemBeingEditedRef} />}
                    <MessageCell
                        key={keyIndex}
                        message={message}
                        messageIndexInTranscript={keyIndex}
                        chatModel={chatModel}
                        isLoading={isLoading}
                        disabled={messageBeingEdited !== undefined && !isItemBeingEdited}
                        showEditButton={message.speaker === 'human'}
                        beingEdited={messageBeingEdited}
                        setBeingEdited={setMessageBeingEdited}
                        showFeedbackButtons={index !== 0 && !isTranscriptError && !message.error}
                        feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                        copyButtonOnSubmit={copyButtonOnSubmit}
                        insertButtonOnSubmit={insertButtonOnSubmit}
                        postMessage={postMessage}
                        userInfo={userInfo}
                        guardrails={guardrails}
                    />
                    {message.speaker === 'human' &&
                        ((message.contextFiles && message.contextFiles.length > 0) || isLastMessage) && (
                            <ContextCell
                                contextFiles={message.contextFiles}
                                disabled={messageBeingEdited !== undefined}
                            />
                        )}
                </div>
            )
        }

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
                {transcript.length === 0 && <WelcomeMessageCell welcomeMessage={welcomeMessage} />}
                {earlierMessages.map(messageToTranscriptItem(0))}
                <div ref={lastHumanMessageTopRef} />
                {lastInteractionMessages.map(messageToTranscriptItem(earlierMessages.length))}
                {messageInProgress &&
                    messageInProgress.speaker === 'assistant' &&
                    Boolean(transcript[earlierMessages.length].contextFiles) && (
                        <MessageCell
                            message={messageInProgress}
                            messageIndexInTranscript={transcript.length}
                            chatModel={chatModel}
                            isLoading={true}
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

const WelcomeMessageCell: FunctionComponent<{ welcomeMessage?: string }> = ({ welcomeMessage }) => (
    <Cell gutterIcon={<CodyLogo size={20} />} data-testid="message">
        <div
            className={styles.welcomeMessageCellContent}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: not from user input (and is sanitized)
            dangerouslySetInnerHTML={{
                __html: renderCodyMarkdown(
                    welcomeMessage ??
                        'See [Cody documentation](https://sourcegraph.com/docs/cody) for help and tips.'
                ),
            }}
        />
    </Cell>
)
