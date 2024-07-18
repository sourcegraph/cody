import {
    type ChatMessage,
    type Guardrails,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
    deserializeContextItem,
    isAbortErrorOrSocketHangUp,
} from '@sourcegraph/cody-shared'
import {
    type ComponentProps,
    type FunctionComponent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
} from 'react'
import type { UserAccountInfo } from '../Chat'
import type { ApiPostMessage } from '../Chat'
import type { PromptEditorRefAPI } from '../promptEditor/PromptEditor'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import type { CodeBlockActionsProps } from './ChatMessageContent'
import { ContextCell } from './cells/contextCell/ContextCell'
import {
    AssistantMessageCell,
    makeHumanMessageInfo,
} from './cells/messageCell/assistant/AssistantMessageCell'
import { HumanMessageCell } from './cells/messageCell/human/HumanMessageCell'

export const Transcript: React.FunctionComponent<{
    chatID: string
    transcript: ChatMessage[]
    messageInProgress: ChatMessage | null
    feedbackButtonsOnSubmit: (text: string) => void
    copyButtonOnSubmit: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
    smartApplyButtonOnSubmit?: CodeBlockActionsProps['smartApplyButtonOnSubmit']
    isTranscriptError?: boolean
    userInfo: UserAccountInfo
    chatEnabled: boolean
    postMessage?: ApiPostMessage
    guardrails?: Guardrails
}> = ({ chatID, transcript, messageInProgress, ...props }) => {
    const interactions = useMemo(
        () => transcriptToInteractionPairs(transcript, messageInProgress),
        [transcript, messageInProgress]
    )

    return (
        <div className="tw-px-8 tw-pt-8 tw-pb-14 tw-flex tw-flex-col tw-gap-10">
            {interactions.map((interaction, i) => (
                <TranscriptInteraction
                    chatID={chatID}
                    // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                    key={`${chatID}-${i}`}
                    {...props}
                    transcript={transcript}
                    messageInProgress={messageInProgress}
                    interaction={interaction}
                    isFirstInteraction={i === 0}
                    isLastInteraction={i === interactions.length - 1}
                    isLastSentInteraction={
                        i === interactions.length - 2 && interaction.assistantMessage !== null
                    }
                    priorAssistantMessageIsLoading={Boolean(
                        messageInProgress && interactions.at(i - 1)?.assistantMessage?.isLoading
                    )}
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

const TranscriptInteraction: FunctionComponent<
    ComponentProps<typeof Transcript> & {
        interaction: Interaction
        isFirstInteraction: boolean
        isLastInteraction: boolean
        isLastSentInteraction: boolean
        priorAssistantMessageIsLoading: boolean
    }
> = ({
    interaction: { humanMessage, assistantMessage },
    isFirstInteraction,
    isLastInteraction,
    isLastSentInteraction,
    priorAssistantMessageIsLoading,
    isTranscriptError,
    ...props
}) => {
    const humanEditorRef = useRef<PromptEditorRefAPI | null>(null)
    useEffect(() => {
        return getVSCodeAPI().onMessage(message => {
            if (message.type === 'updateEditorState') {
                humanEditorRef.current?.setEditorState(
                    message.editorState as SerializedPromptEditorState
                )
            }
        })
    }, [])

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

    return (
        <>
            <HumanMessageCell
                {...props}
                key={humanMessage.index}
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
            />
            {((humanMessage.contextFiles && humanMessage.contextFiles.length > 0) ||
                isContextLoading) && (
                <ContextCell
                    key={`${humanMessage.index}-context`}
                    contextItems={humanMessage.contextFiles}
                    model={assistantMessage?.model}
                    isForFirstMessage={humanMessage.index === 0}
                />
            )}
            {assistantMessage && !isContextLoading && (
                <AssistantMessageCell
                    key={assistantMessage.index}
                    {...props}
                    message={assistantMessage}
                    humanMessage={makeHumanMessageInfo(
                        { humanMessage, assistantMessage },
                        humanEditorRef
                    )}
                    isLoading={assistantMessage.isLoading}
                    showFeedbackButtons={
                        !assistantMessage.isLoading &&
                        !isTranscriptError &&
                        !assistantMessage.error &&
                        isLastSentInteraction
                    }
                />
            )}
        </>
    )
}

// TODO(sqs): Do this the React-y way.
export function focusLastHumanMessageEditor(): void {
    const elements = document.querySelectorAll<HTMLElement>('[data-lexical-editor]')
    const lastEditor = elements.item(elements.length - 1)
    lastEditor?.focus()
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
