import {
    type ChatMessage,
    ContextItemSource,
    type Guardrails,
    type Model,
    type NLSSearchDynamicFilter,
    REMOTE_FILE_PROVIDER_URI,
    type SerializedPromptEditorValue,
    deserializeContextItem,
    isAbortErrorOrSocketHangUp,
    serializedPromptEditorStateFromText,
} from '@sourcegraph/cody-shared'
import type { PromptEditorRefAPI } from '@sourcegraph/prompt-editor'
import { clsx } from 'clsx'
import { isEqual } from 'lodash'
import {
    type FC,
    memo,
    useCallback,
    useContext,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react'
import { URI } from 'vscode-uri'
import type { UserAccountInfo } from '../Chat'
import type { ApiPostMessage } from '../Chat'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { SpanManager } from '../utils/spanManager'
import { getTraceparentFromSpanContext } from '../utils/telemetry'
import { useOmniBox } from '../utils/useOmniBox'
import type { CodeBlockActionsProps } from './ChatMessageContent/ChatMessageContent'
import {
    AssistantMessageCell,
    makeHumanMessageInfo,
} from './cells/messageCell/assistant/AssistantMessageCell'
import { HumanMessageCell } from './cells/messageCell/human/HumanMessageCell'

import { type Context, type Span, context, trace } from '@opentelemetry/api'
import { DeepCodyAgentID, ToolCodyModelName } from '@sourcegraph/cody-shared/src/models/client'
import { isCodeSearchContextItem } from '../../src/context/openctx/codeSearch'
import { AgenticContextCell } from './cells/agenticCell/AgenticContextCell'
import ApprovalCell from './cells/agenticCell/ApprovalCell'
import { ContextCell } from './cells/contextCell/ContextCell'
import { DidYouMeanNotice } from './cells/messageCell/assistant/DidYouMean'
import { LastEditorContext } from './context'

interface TranscriptProps {
    activeChatContext?: Context
    setActiveChatContext: (context: Context | undefined) => void
    chatEnabled: boolean
    transcript: ChatMessage[]
    models: Model[]
    userInfo: UserAccountInfo
    messageInProgress: ChatMessage | null
    guardrails?: Guardrails
    postMessage?: ApiPostMessage

    copyButtonOnSubmit: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
    smartApply?: CodeBlockActionsProps['smartApply']
    smartApplyEnabled?: boolean
}

export const Transcript: FC<TranscriptProps> = props => {
    const {
        activeChatContext,
        setActiveChatContext,
        chatEnabled,
        transcript,
        models,
        userInfo,
        messageInProgress,
        guardrails,
        postMessage,
        copyButtonOnSubmit,
        insertButtonOnSubmit,
        smartApply,
        smartApplyEnabled,
    } = props

    const interactions = useMemo(
        () => transcriptToInteractionPairs(transcript, messageInProgress),
        [transcript, messageInProgress]
    )

    const lastHumanEditorRef = useRef<PromptEditorRefAPI | null>(null)

    const onAddToFollowupChat = useCallback(
        ({
            repoName,
            filePath,
            fileURL,
        }: {
            repoName: string
            filePath: string
            fileURL: string
        }) => {
            lastHumanEditorRef.current?.addMentions([
                {
                    providerUri: REMOTE_FILE_PROVIDER_URI,
                    provider: 'openctx',
                    type: 'openctx',
                    uri: URI.parse(fileURL),
                    title: filePath.split('/').at(-1) ?? filePath,
                    description: filePath,
                    source: ContextItemSource.User,
                    mention: {
                        uri: fileURL,
                        description: filePath,
                        data: {
                            repoName,
                            filePath: filePath,
                        },
                    },
                },
            ])
        },
        []
    )

    return (
        <div
            className={clsx(' tw-px-8 tw-pb-6 tw-flex tw-flex-col', {
                'tw-flex-grow': transcript.length > 0,
            })}
        >
            <LastEditorContext.Provider value={lastHumanEditorRef}>
                {interactions.map((interaction, i) => (
                    <TranscriptInteraction
                        key={interaction.humanMessage.index}
                        activeChatContext={activeChatContext}
                        setActiveChatContext={setActiveChatContext}
                        models={models}
                        chatEnabled={chatEnabled}
                        userInfo={userInfo}
                        interaction={interaction}
                        guardrails={guardrails}
                        postMessage={postMessage}
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
                        editorRef={i === interactions.length - 1 ? lastHumanEditorRef : undefined}
                        onAddToFollowupChat={onAddToFollowupChat}
                    />
                ))}
            </LastEditorContext.Provider>
        </div>
    )
}

/** A human-assistant message-and-response pair. */
export interface Interaction {
    /** The human message, either sent or not. */
    humanMessage: ChatMessage & { index: number; isUnsentFollowup: boolean }

    /** `null` if the {@link Interaction["humanMessage"]} has not yet been sent. */
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
            humanMessage: {
                index: pairs.length * 2,
                speaker: 'human',
                isUnsentFollowup: true,
            },
            assistantMessage: null,
        })
    }

    return pairs
}

interface TranscriptInteractionProps
    extends Omit<TranscriptProps, 'transcript' | 'messageInProgress' | 'chatID'> {
    activeChatContext: Context | undefined
    setActiveChatContext: (context: Context | undefined) => void
    interaction: Interaction
    isFirstInteraction: boolean
    isLastInteraction: boolean
    isLastSentInteraction: boolean
    priorAssistantMessageIsLoading: boolean
    editorRef?: React.RefObject<PromptEditorRefAPI | null>
    onAddToFollowupChat?: (props: {
        repoName: string
        filePath: string
        fileURL: string
    }) => void
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
        postMessage,
        guardrails,
        insertButtonOnSubmit,
        copyButtonOnSubmit,
        smartApply,
        smartApplyEnabled,
        editorRef: parentEditorRef,
    } = props
    const [manuallySelectedIntent, setManuallySelectedIntent] =
        useState<ChatMessage['intent']>(undefined)

    // biome-ignore lint/correctness/useExhaustiveDependencies: need to reset manually selected intent when the human message changes
    useEffect(() => {
        setManuallySelectedIntent(undefined)
    }, [humanMessage])

    const { activeChatContext, setActiveChatContext } = props
    const humanEditorRef = useRef<PromptEditorRefAPI | null>(null)
    const lastEditorRef = useContext(LastEditorContext)
    useImperativeHandle(parentEditorRef, () => humanEditorRef.current)

    const usingToolCody = assistantMessage?.model?.includes(ToolCodyModelName)

    const onUserAction = useCallback(
        (action: 'edit' | 'submit', intentFromSubmit?: ChatMessage['intent']) => {
            // Start the span as soon as the user initiates the action
            const startMark = performance.mark('startSubmit')
            const spanManager = new SpanManager('cody-webview')
            const span = spanManager.startSpan('chat-interaction', {
                attributes: {
                    sampled: true,
                    'render.state': 'started',
                    'startSubmit.mark': startMark.startTime,
                },
            })

            if (!span) {
                throw new Error('Failed to start span for chat interaction')
            }

            const spanContext = trace.setSpan(context.active(), span)
            setActiveChatContext(spanContext)
            const currentSpanContext = span.spanContext()

            const traceparent = getTraceparentFromSpanContext(currentSpanContext)

            // Serialize the editor value after starting the span
            const editorValue = humanEditorRef.current?.getSerializedValue()
            if (!editorValue) {
                console.error('Failed to serialize editor value')
                return
            }

            const commonProps = {
                editorValue,
                manuallySelectedIntent: intentFromSubmit || manuallySelectedIntent || 'chat',
                traceparent,
            }

            if (action === 'edit') {
                // Remove search context chips from the next input so that the user cannot
                // reference search results that don't exist anymore.
                // This is a no-op if the input does not contain any search context chips.
                // NOTE: Doing this for the penultimate input only seems to suffice because
                // editing a message earlier in the transcript will clear the conversation
                // and reset the last input anyway.
                if (isLastSentInteraction) {
                    lastEditorRef.current?.filterMentions(item => !isCodeSearchContextItem(item))
                }

                editHumanMessage({
                    messageIndexInTranscript: humanMessage.index,
                    ...commonProps,
                })
            } else {
                submitHumanMessage({
                    ...commonProps,
                })
            }
        },
        [
            humanMessage,
            setActiveChatContext,
            isLastSentInteraction,
            lastEditorRef,
            manuallySelectedIntent,
        ]
    )

    const onEditSubmit = useCallback(
        (intentFromSubmit?: ChatMessage['intent']): void => {
            onUserAction('edit', intentFromSubmit)
        },
        [onUserAction]
    )

    const onFollowupSubmit = useCallback(
        (intentFromSubmit?: ChatMessage['intent']): void => {
            onUserAction('submit', intentFromSubmit)
        },
        [onUserAction]
    )

    const omniboxEnabled = useOmniBox() && !usingToolCody

    const vscodeAPI = getVSCodeAPI()
    const onStop = useCallback(() => {
        vscodeAPI.postMessage({
            command: 'abort',
        })
    }, [vscodeAPI])

    const isSearchIntent = omniboxEnabled && humanMessage.intent === 'search'

    const isContextLoading = Boolean(
        !isSearchIntent &&
            humanMessage.contextFiles === undefined &&
            isLastSentInteraction &&
            assistantMessage?.text === undefined &&
            assistantMessage?.subMessages === undefined
    )
    const spanManager = new SpanManager('cody-webview')
    const renderSpan = useRef<Span>()
    const timeToFirstTokenSpan = useRef<Span>()
    const hasRecordedFirstToken = useRef(false)

    const [isLoading, setIsLoading] = useState(assistantMessage?.isLoading)

    useEffect(() => {
        setIsLoading(assistantMessage?.isLoading)
    }, [assistantMessage])

    useEffect(() => {
        if (!assistantMessage) return

        const startRenderSpan = () => {
            // Reset the spans to their initial state
            renderSpan.current = undefined
            timeToFirstTokenSpan.current = undefined
            hasRecordedFirstToken.current = false

            const startRenderMark = performance.mark('startRender')
            // Start a new span for rendering the assistant message
            renderSpan.current = spanManager.startSpan('assistant-message-render', {
                attributes: {
                    sampled: true,
                    'message.index': assistantMessage.index,
                    'render.start_time': startRenderMark.startTime,
                    'parent.span.id': activeChatContext
                        ? trace.getSpan(activeChatContext)?.spanContext().spanId
                        : undefined,
                },
                context: activeChatContext,
            })
            // Start a span to measure time to first token
            timeToFirstTokenSpan.current = spanManager.startSpan('time-to-first-token', {
                attributes: { 'message.index': assistantMessage.index },
                context: activeChatContext,
            })
        }

        const endRenderSpan = () => {
            // Mark the end of rendering
            performance.mark('endRender')
            // Measure the duration of the render
            const measure = performance.measure('renderDuration', 'startRender', 'endRender')
            if (renderSpan.current && measure.duration > 0) {
                // Set attributes and end the render span
                renderSpan.current.setAttributes({
                    'render.success': !assistantMessage?.error,
                    'message.length': assistantMessage?.text?.length ?? 0,
                    'render.total_time': measure.duration,
                })
                renderSpan.current.end()
            }

            renderSpan.current = undefined
            hasRecordedFirstToken.current = false

            if (activeChatContext) {
                const rootSpan = trace.getSpan(activeChatContext)
                if (rootSpan) {
                    // Calculate and set the total chat time
                    const chatTotalTime =
                        performance.now() - performance.getEntriesByName('startSubmit')[0].startTime
                    rootSpan.setAttributes({
                        'chat.completed': true,
                        'render.state': 'completed',
                        'chat.total_time': chatTotalTime,
                    })
                    rootSpan.end()
                }
            }
            // Clear the active chat context
            setActiveChatContext(undefined)
        }

        const endFirstTokenSpan = () => {
            if (renderSpan.current && timeToFirstTokenSpan.current) {
                // Mark the first token
                performance.mark('firstToken')
                // Measure the time to first token
                performance.measure('timeToFirstToken', 'startRender', 'firstToken')
                const firstTokenMeasure = performance.getEntriesByName('timeToFirstToken')[0]
                if (firstTokenMeasure.duration > 0) {
                    // Set attributes and end the time-to-first-token span
                    timeToFirstTokenSpan.current.setAttributes({
                        'time.to.first.token': firstTokenMeasure.duration,
                    })
                    timeToFirstTokenSpan.current.end()
                    timeToFirstTokenSpan.current = undefined
                    hasRecordedFirstToken.current = true
                }
            }
        }
        // Case 3: End the time-to-first-token span when the first token appears
        if (assistantMessage.text && !hasRecordedFirstToken.current && timeToFirstTokenSpan.current) {
            endFirstTokenSpan()
        }
        // Case 1: Start rendering if the assistant message is loading and no render span exists
        if (assistantMessage.isLoading && !renderSpan.current && activeChatContext) {
            context.with(activeChatContext, startRenderSpan)
        }
        // Case 2: End rendering if loading is complete and a render span exists
        else if (!isLoading && renderSpan.current) {
            endRenderSpan()
        }
    }, [assistantMessage, activeChatContext, setActiveChatContext, spanManager, isLoading])

    const humanMessageInfo = useMemo(() => {
        // See SRCH-942: it's critical to memoize this value to avoid repeated
        // requests to our guardrails server.
        if (assistantMessage && !isContextLoading) {
            return makeHumanMessageInfo({ humanMessage, assistantMessage }, humanEditorRef)
        }
        return null
    }, [humanMessage, assistantMessage, isContextLoading])

    const onHumanMessageSubmit = useCallback(
        (intent?: ChatMessage['intent']) => {
            if (humanMessage.isUnsentFollowup) {
                return onFollowupSubmit(intent)
            }
            onEditSubmit(intent)
        },
        [humanMessage.isUnsentFollowup, onFollowupSubmit, onEditSubmit]
    )

    const onSelectedFiltersUpdate = useCallback(
        (selectedFilters: NLSSearchDynamicFilter[]) => {
            reevaluateSearchWithSelectedFilters({
                messageIndexInTranscript: humanMessage.index,
                selectedFilters,
            })
        },
        [humanMessage.index]
    )

    const editAndSubmitSearch = useCallback(
        (text: string) =>
            editHumanMessage({
                messageIndexInTranscript: humanMessage.index,
                editorValue: {
                    text,
                    contextItems: [],
                    editorState: serializedPromptEditorStateFromText(text),
                },
                manuallySelectedIntent: 'search',
            }),
        [humanMessage]
    )

    return (
        <>
            <HumanMessageCell
                key={humanMessage.index}
                userInfo={userInfo}
                models={models}
                chatEnabled={chatEnabled}
                message={humanMessage}
                isFirstMessage={humanMessage.index === 0}
                isSent={!humanMessage.isUnsentFollowup}
                isPendingPriorResponse={priorAssistantMessageIsLoading}
                onSubmit={onHumanMessageSubmit}
                onStop={onStop}
                isFirstInteraction={isFirstInteraction}
                isLastInteraction={isLastInteraction}
                isEditorInitiallyFocused={isLastInteraction}
                editorRef={humanEditorRef}
                className={!isFirstInteraction && isLastInteraction ? 'tw-mt-auto' : ''}
                intent={manuallySelectedIntent}
                manuallySelectIntent={setManuallySelectedIntent}
            />
            {omniboxEnabled && assistantMessage?.didYouMeanQuery && (
                <DidYouMeanNotice
                    query={assistantMessage?.didYouMeanQuery}
                    disabled={!!assistantMessage?.isLoading}
                    switchToSearch={() => editAndSubmitSearch(assistantMessage?.didYouMeanQuery ?? '')}
                />
            )}
            {!usingToolCody && !isSearchIntent && humanMessage.agent && (
                <AgenticContextCell
                    key={`${humanMessage.index}-${humanMessage.intent}-process`}
                    isContextLoading={isContextLoading}
                    processes={humanMessage?.processes ?? undefined}
                />
            )}
            {!isSearchIntent &&
                humanMessage.agent &&
                isContextLoading &&
                assistantMessage?.isLoading && <ApprovalCell vscodeAPI={vscodeAPI} />}

            {!usingToolCody &&
                !(humanMessage.agent && isContextLoading) &&
                (humanMessage.contextFiles || assistantMessage || isContextLoading) &&
                !isSearchIntent && (
                    <ContextCell
                        key={`${humanMessage.index}-${humanMessage.intent}-context`}
                        contextItems={humanMessage.contextFiles}
                        contextAlternatives={humanMessage.contextAlternatives}
                        model={assistantMessage?.model}
                        isForFirstMessage={humanMessage.index === 0}
                        isContextLoading={isContextLoading}
                        defaultOpen={isContextLoading && humanMessage.agent === DeepCodyAgentID}
                        agent={humanMessage?.agent ?? undefined}
                    />
                )}
            {assistantMessage &&
                (!isContextLoading ||
                    (assistantMessage.subMessages && assistantMessage.subMessages.length > 0)) && (
                    <AssistantMessageCell
                        key={assistantMessage.index}
                        userInfo={userInfo}
                        models={models}
                        chatEnabled={chatEnabled}
                        message={assistantMessage}
                        copyButtonOnSubmit={copyButtonOnSubmit}
                        insertButtonOnSubmit={insertButtonOnSubmit}
                        postMessage={postMessage}
                        guardrails={guardrails}
                        humanMessage={humanMessageInfo}
                        isLoading={assistantMessage.isLoading}
                        smartApply={smartApply}
                        smartApplyEnabled={smartApplyEnabled}
                        onSelectedFiltersUpdate={onSelectedFiltersUpdate}
                        isLastSentInteraction={isLastSentInteraction}
                    />
                )}
        </>
    )
}, isEqual)

// TODO(sqs): Do this the React-y way.
export function focusLastHumanMessageEditor(): void {
    const elements = document.querySelectorAll<HTMLElement>('[data-lexical-editor]')
    const lastEditor = elements.item(elements.length - 1)
    if (!lastEditor) {
        return
    }

    lastEditor.focus()

    // Only scroll the nearest scrollable ancestor container, not all scrollable ancestors, to avoid
    // a bug in VS Code where the iframe is pushed up by ~5px.
    const container = lastEditor?.closest('[data-scrollable]')
    const editorScrollItemInContainer = lastEditor.parentElement
    if (container && container instanceof HTMLElement && editorScrollItemInContainer) {
        container.scrollTop = editorScrollItemInContainer.offsetTop - container.offsetTop
    }
}

export function editHumanMessage({
    messageIndexInTranscript,
    editorValue,
    manuallySelectedIntent,
}: {
    messageIndexInTranscript: number
    editorValue: SerializedPromptEditorValue
    manuallySelectedIntent?: ChatMessage['intent']
}): void {
    getVSCodeAPI().postMessage({
        command: 'edit',
        index: messageIndexInTranscript,
        text: editorValue.text,
        editorState: editorValue.editorState,
        contextItems: editorValue.contextItems.map(deserializeContextItem),
        manuallySelectedIntent,
    })
    focusLastHumanMessageEditor()
}

function submitHumanMessage({
    editorValue,
    manuallySelectedIntent,
    traceparent,
}: {
    editorValue: SerializedPromptEditorValue
    manuallySelectedIntent?: ChatMessage['intent']
    traceparent: string
}): void {
    getVSCodeAPI().postMessage({
        command: 'submit',
        text: editorValue.text,
        editorState: editorValue.editorState,
        contextItems: editorValue.contextItems.map(deserializeContextItem),
        manuallySelectedIntent,
        traceparent,
    })
    focusLastHumanMessageEditor()
}

function reevaluateSearchWithSelectedFilters({
    messageIndexInTranscript,
    selectedFilters,
}: {
    messageIndexInTranscript: number
    selectedFilters: NLSSearchDynamicFilter[]
}): void {
    getVSCodeAPI().postMessage({
        command: 'reevaluateSearchWithSelectedFilters',
        index: messageIndexInTranscript,
        selectedFilters,
    })
}
