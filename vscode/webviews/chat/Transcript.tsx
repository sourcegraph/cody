import {
    type ChatMessage,
    type Guardrails,
    type SerializedPromptEditorValue,
    deserializeContextItem,
} from '@sourcegraph/cody-shared'
import { type ComponentProps, type FunctionComponent, useCallback, useMemo, useRef } from 'react'
import type { UserAccountInfo } from '../Chat'
import type { ApiPostMessage } from '../Chat'
import type { PromptEditorRefAPI } from '../promptEditor/PromptEditor'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import type { CodeBlockActionsProps } from './ChatMessageContent'
import styles from './Transcript.module.css'
import { ContextCell } from './cells/contextCell/ContextCell'
import {
    AssistantMessageCell,
    makeHumanMessageInfo,
} from './cells/messageCell/assistant/AssistantMessageCell'
import { HumanMessageCell } from './cells/messageCell/human/HumanMessageCell'

export const Transcript: React.FunctionComponent<{
    transcript: ChatMessage[]
    messageInProgress: ChatMessage | null
    feedbackButtonsOnSubmit: (text: string) => void
    copyButtonOnSubmit: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit: CodeBlockActionsProps['insertButtonOnSubmit']
    isTranscriptError?: boolean
    userInfo: UserAccountInfo
    chatEnabled: boolean
    postMessage?: ApiPostMessage
    guardrails?: Guardrails
}> = ({ transcript, messageInProgress, ...props }) => {
    const interactions = useMemo(
        () => transcriptToInteractionPairs(transcript, messageInProgress),
        [transcript, messageInProgress]
    )
    return (
        <>
            {interactions.map((interaction, i) => (
                <TranscriptInteraction
                    // biome-ignore lint/suspicious/noArrayIndexKey:
                    key={i}
                    {...props}
                    transcript={transcript}
                    messageInProgress={messageInProgress}
                    interaction={interaction}
                    isLastInteraction={i === interactions.length - 1}
                    isLastSentInteraction={
                        i === interactions.length - 2 && interaction.assistantMessage !== null
                    }
                    priorAssistantMessageIsLoading={Boolean(
                        interactions.at(i - 1)?.assistantMessage?.isLoading
                    )}
                />
            ))}
        </>
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
    for (const [i, message] of transcript.entries()) {
        if (i % 2 === 1) {
            continue
        }
        const humanMessage = message
        const isLastPairInTranscript = transcript.length === i + 1
        const assistantMessage = isLastPairInTranscript ? assistantMessageInProgress : transcript[i + 1]
        if (humanMessage.speaker === 'human') {
            pairs.push({
                humanMessage: { ...humanMessage, index: i, isUnsentFollowup: false },
                assistantMessage: assistantMessage
                    ? {
                          ...assistantMessage,
                          index: i + 1,
                          isLoading:
                              assistantMessage.error === undefined &&
                              (isLastPairInTranscript || assistantMessage.text === undefined),
                      }
                    : null,
            })
        }
    }

    const lastAssistantMessageIsError = Boolean(pairs.at(-1)?.assistantMessage?.error)
    if (!lastAssistantMessageIsError) {
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
        isLastInteraction: boolean
        isLastSentInteraction: boolean
        priorAssistantMessageIsLoading: boolean
    }
> = ({
    interaction: { humanMessage, assistantMessage },
    isLastInteraction,
    isLastSentInteraction,
    priorAssistantMessageIsLoading,
    isTranscriptError,
    ...props
}) => {
    const humanEditorRef = useRef<PromptEditorRefAPI | null>(null)
    const onEditSubmit = useCallback(
        (editorValue: SerializedPromptEditorValue): void => {
            editHumanMessage(humanMessage.index, editorValue)
        },
        [humanMessage]
    )

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
                isEditorInitiallyFocused={isLastInteraction}
                editorRef={humanEditorRef}
                className={isLastInteraction ? styles.lastHumanMessage : undefined}
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
                        !assistantMessage.isLoading && !isTranscriptError && !assistantMessage.error
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
}
