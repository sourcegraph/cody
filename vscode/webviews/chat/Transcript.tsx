import {
    type ChatMessage,
    type Guardrails,
    type SerializedPromptEditorValue,
    deserializeContextItem,
    isAbortErrorOrSocketHangUp,
} from '@sourcegraph/cody-shared'
import type { PromptEditorRefAPI } from '@sourcegraph/prompt-editor'
import { clsx } from 'clsx'
import isEqual from 'lodash/isEqual'
import { type FC, memo, useCallback, useMemo, useRef } from 'react'
import type { UserAccountInfo } from '../Chat'
import type { ApiPostMessage } from '../Chat'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import type { CodeBlockActionsProps } from './ChatMessageContent/ChatMessageContent'
import { ContextCell } from './cells/contextCell/ContextCell'
import {
    AssistantMessageCell,
    makeHumanMessageInfo,
} from './cells/messageCell/assistant/AssistantMessageCell'
import { HumanMessageCell } from './cells/messageCell/human/HumanMessageCell'

interface TranscriptProps {
    chatEnabled: boolean
    transcript: ChatMessage[]
    userInfo: UserAccountInfo
    messageInProgress: ChatMessage | null

    guardrails?: Guardrails
    postMessage?: ApiPostMessage
    isTranscriptError?: boolean

    feedbackButtonsOnSubmit: (text: string) => void
    copyButtonOnSubmit: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
    smartApply?: CodeBlockActionsProps['smartApply']
    smartApplyEnabled?: boolean
}

export const Transcript: FC<TranscriptProps> = props => {
    const {
        chatEnabled,
        transcript,
        userInfo,
        messageInProgress,
        guardrails,
        postMessage,
        isTranscriptError,
        feedbackButtonsOnSubmit,
        copyButtonOnSubmit,
        insertButtonOnSubmit,
        smartApply,
        smartApplyEnabled,
    } = props

    const interactions = useMemo(
        () => transcriptToInteractionPairs(transcript, messageInProgress),
        [transcript, messageInProgress]
    )

    return (
        <div
            className={clsx('tw-px-6 tw-pt-8 tw-pb-12 tw-flex tw-flex-col tw-gap-8', {
                'tw-flex-grow': transcript.length > 0,
            })}
        >
            {interactions.map((interaction, i) => (
                <TranscriptInteraction
                    // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                    key={i}
                    chatEnabled={chatEnabled}
                    userInfo={userInfo}
                    interaction={interaction}
                    guardrails={guardrails}
                    postMessage={postMessage}
                    isTranscriptError={isTranscriptError}
                    feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                    copyButtonOnSubmit={copyButtonOnSubmit}
                    insertButtonOnSubmit={insertButtonOnSubmit}
                    isFirstInteraction={i === 0}
                    isLastInteraction={i === interactions.length - 1}
                    isLastSentInteraction={
                        i === interactions.length - 2 && interaction.assistantMessage !== null
                    }
                    priorAssistantMessageIsLoading={Boolean(
                        messageInProgress && interactions.at(i - 1)?.assistantMessage?.isLoading
                    )}
                    smartApply={smartApply}
                    smartApplyEnabled={smartApplyEnabled}
                />
            ))}
        </div>
    )
}

/** A human-assistant message-and-response pair. */
export interface Interaction {
    /** The human message, either sent or not. */
    humanMessage: ChatMessage & { index: number; isUnsentFollowup: boolean }

    /** `null` if the {@link Interaction.humanMessage} has not yet been sent. */
    assistantMessage: (ChatMessage & { index: number; isLoading: boolean }) | null
}

export function transcriptToInteractionPairs(
    transcript: ChatMessage[],
    assistantMessageInProgress: ChatMessage | null
): Interaction[] {
    const pairs: Interaction[] = []
    const transcriptLength = transcript.length

    for (let i = 0; i < transcriptLength; i += 2) {
        const humanMessage = transcript[i]
        if (humanMessage.speaker !== 'human') continue

        const isLastPair = i === transcriptLength - 1
        const assistantMessage = isLastPair ? assistantMessageInProgress : transcript[i + 1]

        const isLoading =
            assistantMessage &&
            assistantMessage.error === undefined &&
            assistantMessageInProgress &&
            (isLastPair || assistantMessage.text === undefined)

        pairs.push({
            humanMessage: { ...humanMessage, index: i, isUnsentFollowup: false },
            assistantMessage: assistantMessage
                ? { ...assistantMessage, index: i + 1, isLoading: !!isLoading }
                : null,
        })
    }

    const lastAssistantMessage = pairs[pairs.length - 1]?.assistantMessage
    const isAborted = isAbortErrorOrSocketHangUp(lastAssistantMessage?.error)
    const shouldAddFollowup =
        lastAssistantMessage &&
        (!lastAssistantMessage.error ||
            (isAborted && lastAssistantMessage.text) ||
            (!assistantMessageInProgress && lastAssistantMessage.text))

    if (!transcript.length || shouldAddFollowup) {
        pairs.push({
            humanMessage: { index: pairs.length * 2, speaker: 'human', isUnsentFollowup: true },
            assistantMessage: null,
        })
    }

    return pairs
}

interface TranscriptInteractionProps
    extends Omit<TranscriptProps, 'transcript' | 'messageInProgress' | 'chatID'> {
    interaction: Interaction
    isFirstInteraction: boolean
    isLastInteraction: boolean
    isLastSentInteraction: boolean
    priorAssistantMessageIsLoading: boolean
}

const TranscriptInteraction: FC<TranscriptInteractionProps> = memo(props => {
    const {
        interaction: { humanMessage, assistantMessage },
        isFirstInteraction,
        isLastInteraction,
        isLastSentInteraction,
        priorAssistantMessageIsLoading,
        isTranscriptError,
        userInfo,
        chatEnabled,
        feedbackButtonsOnSubmit,
        postMessage,
        guardrails,
        insertButtonOnSubmit,
        copyButtonOnSubmit,
        smartApply,
        smartApplyEnabled,
    } = props

    const humanEditorRef = useRef<PromptEditorRefAPI | null>(null)

    const onEditSubmit = useCallback(
        (editorValue: SerializedPromptEditorValue): void => {
            editHumanMessage(humanMessage.index, editorValue)
        },
        [humanMessage]
    )

    const onStop = useCallback(() => {
        getVSCodeAPI().postMessage({
            command: 'abort',
        })
    }, [])

    const isContextLoading = Boolean(
        humanMessage.contextFiles === undefined &&
            isLastSentInteraction &&
            assistantMessage?.text === undefined
    )

    const humanMessageInfo = useMemo(() => {
        // See SRCH-942: it's critical to memoize this value to avoid repeated
        // requests to our guardrails server.
        if (assistantMessage && !isContextLoading) {
            return makeHumanMessageInfo({ humanMessage, assistantMessage }, humanEditorRef)
        }
        return null
    }, [humanMessage, assistantMessage, isContextLoading])

    return (
        <>
            <HumanMessageCell
                key={humanMessage.index}
                userInfo={userInfo}
                chatEnabled={chatEnabled}
                message={humanMessage}
                isFirstMessage={humanMessage.index === 0}
                isSent={!humanMessage.isUnsentFollowup}
                isPendingPriorResponse={priorAssistantMessageIsLoading}
                onSubmit={humanMessage.isUnsentFollowup ? onFollowupSubmit : onEditSubmit}
                onStop={onStop}
                isFirstInteraction={isFirstInteraction}
                isLastInteraction={isLastInteraction}
                isEditorInitiallyFocused={isLastInteraction}
                editorRef={humanEditorRef}
                className={!isFirstInteraction && isLastInteraction ? 'tw-mt-auto' : ''}
            />
            {((humanMessage.contextFiles && humanMessage.contextFiles.length > 0) ||
                isContextLoading) && (
                <ContextCell
                    key={`${humanMessage.index}-context`}
                    contextItems={humanMessage.contextFiles}
                    contextAlternatives={humanMessage.contextAlternatives}
                    model={assistantMessage?.model}
                    isForFirstMessage={humanMessage.index === 0}
                />
            )}
            {assistantMessage && !isContextLoading && (
                <AssistantMessageCell
                    key={assistantMessage.index}
                    userInfo={userInfo}
                    chatEnabled={chatEnabled}
                    message={assistantMessage}
                    feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                    copyButtonOnSubmit={copyButtonOnSubmit}
                    insertButtonOnSubmit={insertButtonOnSubmit}
                    postMessage={postMessage}
                    guardrails={guardrails}
                    humanMessage={humanMessageInfo}
                    isLoading={assistantMessage.isLoading}
                    showFeedbackButtons={
                        !assistantMessage.isLoading &&
                        !isTranscriptError &&
                        !assistantMessage.error &&
                        isLastSentInteraction
                    }
                    smartApply={smartApply}
                    smartApplyEnabled={smartApplyEnabled}
                />
            )}
        </>
    )
}, isEqual)

// TODO(sqs): Do this the React-y way.
export function focusLastHumanMessageEditor(): void {
    const elements = document.querySelectorAll<HTMLElement>('[data-lexical-editor]')
    const lastEditor = elements.item(elements.length - 1)
    lastEditor?.focus()
    lastEditor?.scrollIntoView()
}

export function editHumanMessage(
    messageIndexInTranscript: number,
    editorValue: SerializedPromptEditorValue
): void {
    getVSCodeAPI().postMessage({
        command: 'edit',
        index: messageIndexInTranscript,
        text: editorValue.text,
        editorState: editorValue.editorState,
        contextFiles: editorValue.contextItems.map(deserializeContextItem),
    })
    focusLastHumanMessageEditor()
}

function onFollowupSubmit(editorValue: SerializedPromptEditorValue): void {
    getVSCodeAPI().postMessage({
        command: 'submit',
        submitType: 'user',
        text: editorValue.text,
        editorState: editorValue.editorState,
        contextFiles: editorValue.contextItems.map(deserializeContextItem),
    })
    focusLastHumanMessageEditor()
}
