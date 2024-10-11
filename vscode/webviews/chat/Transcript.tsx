import {
    type ChatMessage,
    type Guardrails,
    type Model,
    type SerializedPromptEditorValue,
    deserializeContextItem,
    inputTextWithoutContextChipsFromPromptEditorState,
    isAbortErrorOrSocketHangUp,
} from '@sourcegraph/cody-shared'
import { type PromptEditorRefAPI, useExtensionAPI } from '@sourcegraph/prompt-editor'
import { clsx } from 'clsx'
import debounce from 'lodash/debounce'
import isEqual from 'lodash/isEqual'
import { Search } from 'lucide-react'
import { type FC, type MutableRefObject, memo, useCallback, useMemo, useRef } from 'react'
import type { UserAccountInfo } from '../Chat'
import type { ApiPostMessage } from '../Chat'
import { Button } from '../components/shadcn/ui/button'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { useTelemetryRecorder } from '../utils/telemetry'
import { useExperimentalOneBox } from '../utils/useExperimentalOneBox'
import type { CodeBlockActionsProps } from './ChatMessageContent/ChatMessageContent'
import { ContextCell } from './cells/contextCell/ContextCell'
import {
    AssistantMessageCell,
    makeHumanMessageInfo,
} from './cells/messageCell/assistant/AssistantMessageCell'
import { HumanMessageCell } from './cells/messageCell/human/HumanMessageCell'
import { CodyIcon } from './components/CodyIcon'
import { InfoMessage } from './components/InfoMessage'

interface TranscriptProps {
    chatEnabled: boolean
    transcript: ChatMessage[]
    models: Model[]
    userInfo: UserAccountInfo
    messageInProgress: ChatMessage | null

    guardrails?: Guardrails
    postMessage?: ApiPostMessage

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
        models,
        userInfo,
        messageInProgress,
        guardrails,
        postMessage,
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
                    key={interaction.humanMessage.index}
                    models={models}
                    chatEnabled={chatEnabled}
                    userInfo={userInfo}
                    interaction={interaction}
                    guardrails={guardrails}
                    postMessage={postMessage}
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
        models,
        isFirstInteraction,
        isLastInteraction,
        isLastSentInteraction,
        priorAssistantMessageIsLoading,
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

    const [intentResults, setIntentResults] = useMutatedValue<
        | { intent: ChatMessage['intent']; allScores?: { intent: string; score: number }[] }
        | undefined
        | null
    >()

    const humanEditorRef = useRef<PromptEditorRefAPI | null>(null)

    const onEditSubmit = useCallback(
        (editorValue: SerializedPromptEditorValue, intentFromSubmit?: ChatMessage['intent']): void => {
            editHumanMessage({
                messageIndexInTranscript: humanMessage.index,
                editorValue,
                intent: intentFromSubmit || intentResults.current?.intent,
                intentScores: intentFromSubmit ? undefined : intentResults.current?.allScores,
                manuallySelectedIntent: !!intentFromSubmit,
            })
        },
        [humanMessage.index, intentResults]
    )

    const onFollowupSubmit = useCallback(
        (editorValue: SerializedPromptEditorValue, intentFromSubmit?: ChatMessage['intent']): void => {
            submitHumanMessage({
                editorValue,
                intent: intentFromSubmit || intentResults.current?.intent,
                intentScores: intentFromSubmit ? undefined : intentResults.current?.allScores,
                manuallySelectedIntent: !!intentFromSubmit,
            })
        },
        [intentResults]
    )

    const extensionAPI = useExtensionAPI()
    const experimentalOneBoxEnabled = useExperimentalOneBox()

    const onChange = useMemo(() => {
        return debounce(async (editorValue: SerializedPromptEditorValue) => {
            setIntentResults(undefined)

            if (!experimentalOneBoxEnabled) {
                return
            }

            // Only detect intent if a repository is mentioned
            if (
                editorValue.contextItems.find(contextItem =>
                    ['repository', 'tree'].includes(contextItem.type)
                )
            ) {
                extensionAPI
                    .detectIntent(
                        inputTextWithoutContextChipsFromPromptEditorState(editorValue.editorState)
                    )
                    .subscribe(value => {
                        setIntentResults(value)
                    })
            }
        }, 300)
    }, [experimentalOneBoxEnabled, extensionAPI, setIntentResults])

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

    const telemetryRecorder = useTelemetryRecorder()
    const reSubmitWithIntent = useCallback(
        (intent: ChatMessage['intent']) => {
            const editorState = humanEditorRef.current?.getSerializedValue()
            if (editorState) {
                onEditSubmit(editorState, intent)
                telemetryRecorder.recordEvent('onebox.intentCorrection', 'clicked', {
                    metadata: {
                        recordsPrivateMetadataTranscript: 1,
                    },
                    privateMetadata: {
                        initialIntent: humanMessage.intent,
                        userSpecifiedIntent: intent,
                        promptText: editorState.text,
                    },
                })
            }
        },
        [onEditSubmit, telemetryRecorder, humanMessage]
    )

    const reSubmitWithChatIntent = useCallback(() => reSubmitWithIntent('chat'), [reSubmitWithIntent])
    const reSubmitWithSearchIntent = useCallback(
        () => reSubmitWithIntent('search'),
        [reSubmitWithIntent]
    )

    const resetIntent = useCallback(() => setIntentResults(undefined), [setIntentResults])

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
                onChange={onChange}
                onSubmit={humanMessage.isUnsentFollowup ? onFollowupSubmit : onEditSubmit}
                onStop={onStop}
                isFirstInteraction={isFirstInteraction}
                isLastInteraction={isLastInteraction}
                isEditorInitiallyFocused={isLastInteraction}
                editorRef={humanEditorRef}
                className={!isFirstInteraction && isLastInteraction ? 'tw-mt-auto' : ''}
                onEditorFocusChange={resetIntent}
                models={models}
            />

            {experimentalOneBoxEnabled && humanMessage.intent && (
                <InfoMessage>
                    {humanMessage.intent === 'search' ? (
                        <div className="tw-flex tw-justify-between tw-gap-4 tw-items-center">
                            <span>Intent detection selected a code search response.</span>
                            <div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="tw-text-prmary tw-flex tw-gap-2 tw-items-center"
                                    onClick={reSubmitWithChatIntent}
                                >
                                    <CodyIcon className="tw-text-link" />
                                    Ask the LLM
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="tw-flex tw-justify-between tw-gap-4 tw-items-center">
                            <span>Intent detection selected an LLM response.</span>
                            <div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="tw-text-prmary tw-flex tw-gap-2 tw-items-center"
                                    onClick={reSubmitWithSearchIntent}
                                >
                                    <Search className="tw-size-8 tw-text-link" />
                                    Search Code
                                </Button>
                            </div>
                        </div>
                    )}
                </InfoMessage>
            )}
            {((humanMessage.contextFiles && humanMessage.contextFiles.length > 0) ||
                isContextLoading) && (
                <ContextCell
                    key={`${humanMessage.index}-${humanMessage.intent}-context`}
                    contextItems={humanMessage.contextFiles}
                    contextAlternatives={humanMessage.contextAlternatives}
                    model={assistantMessage?.model}
                    isForFirstMessage={humanMessage.index === 0}
                    showSnippets={experimentalOneBoxEnabled && humanMessage.intent === 'search'}
                    defaultOpen={experimentalOneBoxEnabled && humanMessage.intent === 'search'}
                    reSubmitWithChatIntent={reSubmitWithChatIntent}
                    isContextLoading={isContextLoading}
                />
            )}
            {(!experimentalOneBoxEnabled || humanMessage.intent !== 'search') &&
                assistantMessage &&
                !isContextLoading && (
                    <AssistantMessageCell
                        key={assistantMessage.index}
                        userInfo={userInfo}
                        chatEnabled={chatEnabled}
                        message={assistantMessage}
                        models={models}
                        feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                        copyButtonOnSubmit={copyButtonOnSubmit}
                        insertButtonOnSubmit={insertButtonOnSubmit}
                        postMessage={postMessage}
                        guardrails={guardrails}
                        humanMessage={humanMessageInfo}
                        isLoading={assistantMessage.isLoading}
                        showFeedbackButtons={
                            !assistantMessage.isLoading &&
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

function useMutatedValue<T>(value?: T): [MutableRefObject<T | undefined>, setValue: (value: T) => void] {
    const valueRef = useRef<T | undefined>(value)

    return [
        valueRef,
        useCallback(value => {
            valueRef.current = value
        }, []),
    ]
}

// TODO(sqs): Do this the React-y way.
export function focusLastHumanMessageEditor(): void {
    const elements = document.querySelectorAll<HTMLElement>('[data-lexical-editor]')
    const lastEditor = elements.item(elements.length - 1)
    lastEditor?.focus()
    lastEditor?.scrollIntoView()
}

export function editHumanMessage({
    messageIndexInTranscript,
    editorValue,
    intent,
    intentScores,
    manuallySelectedIntent,
}: {
    messageIndexInTranscript: number
    editorValue: SerializedPromptEditorValue
    intent?: ChatMessage['intent']
    intentScores?: { intent: string; score: number }[]
    manuallySelectedIntent?: boolean
}): void {
    getVSCodeAPI().postMessage({
        command: 'edit',
        index: messageIndexInTranscript,
        text: editorValue.text,
        editorState: editorValue.editorState,
        contextItems: editorValue.contextItems.map(deserializeContextItem),
        intent,
        intentScores,
        manuallySelectedIntent,
    })
    focusLastHumanMessageEditor()
}

function submitHumanMessage({
    editorValue,
    intent,
    intentScores,
    manuallySelectedIntent,
}: {
    editorValue: SerializedPromptEditorValue
    intent?: ChatMessage['intent']
    intentScores?: { intent: string; score: number }[]
    manuallySelectedIntent?: boolean
}): void {
    getVSCodeAPI().postMessage({
        command: 'submit',
        text: editorValue.text,
        editorState: editorValue.editorState,
        contextItems: editorValue.contextItems.map(deserializeContextItem),
        intent,
        intentScores,
        manuallySelectedIntent,
    })
    focusLastHumanMessageEditor()
}
