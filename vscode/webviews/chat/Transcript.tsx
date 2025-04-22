import {
    type ChatMessage,
    type Guardrails,
    type Model,
    type NLSSearchDynamicFilter,
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
import * as uuid from 'uuid'
import { isCodeSearchContextItem } from '../../src/context/openctx/codeSearch'
import { useClientActionListener } from '../client/clientState'
import { useLocalStorage } from '../components/hooks'
import { AgenticContextCell } from './cells/agenticCell/AgenticContextCell'
import ApprovalCell from './cells/agenticCell/ApprovalCell'
import { ContextCell } from './cells/contextCell/ContextCell'
import { DidYouMeanNotice } from './cells/messageCell/assistant/DidYouMean'
import { ToolStatusCell } from './cells/toolCell/ToolStatusCell'
import { LoadingDots } from './components/LoadingDots'
import { LastEditorContext } from './context'

interface TranscriptProps {
    activeChatContext?: Context
    setActiveChatContext: (context: Context | undefined) => void
    chatEnabled: boolean
    transcript: ChatMessage[]
    models: Model[]
    userInfo: UserAccountInfo
    messageInProgress: ChatMessage | null
    guardrails: Guardrails
    postMessage?: ApiPostMessage

    copyButtonOnSubmit: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
    smartApply?: CodeBlockActionsProps['smartApply']

    manuallySelectedIntent: ChatMessage['intent']
    setManuallySelectedIntent: (intent: ChatMessage['intent']) => void
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
        manuallySelectedIntent,
        setManuallySelectedIntent,
    } = props

    const interactions = useMemo(
        () => transcriptToInteractionPairs(transcript, messageInProgress, manuallySelectedIntent),
        [transcript, messageInProgress, manuallySelectedIntent]
    )

    const lastHumanEditorRef = useRef<PromptEditorRefAPI | null>(null)

    return (
        <div
            className={clsx(' tw-px-8 tw-py-4 tw-flex tw-flex-col tw-gap-4', {
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
                        editorRef={
                            ((interaction.humanMessage.intent === 'agentic' &&
                                interaction.humanMessage.index === -1) ||
                                i === interactions.length - 1) &&
                            !messageInProgress
                                ? lastHumanEditorRef
                                : undefined
                        }
                        manuallySelectedIntent={manuallySelectedIntent}
                        setManuallySelectedIntent={setManuallySelectedIntent}
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
    assistantMessageInProgress: ChatMessage | null,
    manuallySelectedIntent: ChatMessage['intent']
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
            isLastPair

        pairs.push({
            humanMessage: {
                ...humanMessage,
                index: i,
                isUnsentFollowup: false,
                intent: humanMessage.intent ?? null,
            },
            assistantMessage: assistantMessage
                ? { ...assistantMessage, index: i + 1, isLoading: !!isLoading }
                : null,
        })
    }

    const lastMessage = pairs[pairs.length - 1]
    const lastHumanMessage = lastMessage?.humanMessage
    const lastAssistantMessage = lastMessage?.assistantMessage
    const isAborted = isAbortErrorOrSocketHangUp(lastAssistantMessage?.error)
    const shouldAddFollowup =
        lastAssistantMessage &&
        (!lastAssistantMessage.error ||
            (isAborted && lastAssistantMessage.text) ||
            (!assistantMessageInProgress && lastAssistantMessage.text))

    if (!transcript.length || shouldAddFollowup) {
        pairs.push({
            humanMessage: {
                // Always using a fixed index for the last/followup editor ensures it will be reused
                // across renders and not recreated when transcript length changes.
                // This is a hack to avoid the editor getting reset during Agent mode.
                index: lastHumanMessage?.intent === 'agentic' ? -1 : pairs.length * 2,
                speaker: 'human',
                isUnsentFollowup: true,
                // If the last submitted message was a search, default to chat for the followup. Else,
                // keep the manually selected intent, if any, or the last human message's intent.
                intent: lastHumanMessage?.intent === 'search' ? 'chat' : lastHumanMessage?.intent,
                manuallySelectedIntent,
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
    manuallySelectedIntent: ChatMessage['intent']
    setManuallySelectedIntent: (intent: ChatMessage['intent']) => void
}

export type RegeneratingCodeBlockState = {
    id: string
    code: string
    error: string | undefined
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
        editorRef: parentEditorRef,
        manuallySelectedIntent,
        setManuallySelectedIntent,
    } = props

    const { activeChatContext, setActiveChatContext } = props
    const humanEditorRef = useRef<PromptEditorRefAPI | null>(null)
    const lastEditorRef = useContext(LastEditorContext)
    useImperativeHandle(parentEditorRef, () => humanEditorRef.current)

    const usingToolCody = assistantMessage?.model?.includes(ToolCodyModelName)

    const onUserAction = useCallback(
        (action: 'edit' | 'submit') => {
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
                    manuallySelectedIntent: manuallySelectedIntent,
                })
            } else {
                submitHumanMessage({
                    ...commonProps,
                    manuallySelectedIntent: manuallySelectedIntent,
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

    const onEditSubmit = useCallback((): void => {
        onUserAction('edit')
    }, [onUserAction])

    const onFollowupSubmit = useCallback((): void => {
        onUserAction('submit')
    }, [onUserAction])

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

    const [isThoughtProcessOpened, setThoughtProcessOpened] = useLocalStorage(
        'cody.thinking-space.open',
        true
    )

    useEffect(() => {
        setIsLoading(assistantMessage?.isLoading)
    }, [assistantMessage])

    const humanMessageText = humanMessage.text
    const smartApplyWithInstruction = useMemo(() => {
        if (!smartApply) return undefined
        return {
            ...smartApply,
            onSubmit(params: Parameters<typeof smartApply.onSubmit>[0]) {
                return smartApply.onSubmit({
                    ...params,
                    instruction: params.instruction ?? humanMessageText,
                })
            },
        }
    }, [smartApply, humanMessageText])

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

    const onHumanMessageSubmit = useCallback(() => {
        if (humanMessage.isUnsentFollowup) {
            onFollowupSubmit()
        } else {
            onEditSubmit()
        }
        // Set the unsent followup flag to false after submitting
        // to makes sure the last editor for Agent mode gets reset.
        humanMessage.isUnsentFollowup = false
    }, [humanMessage, onFollowupSubmit, onEditSubmit])

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
        (text: string) => {
            setManuallySelectedIntent('search')
            editHumanMessage({
                messageIndexInTranscript: humanMessage.index,
                editorValue: {
                    text,
                    contextItems: [],
                    editorState: serializedPromptEditorStateFromText(text),
                },
                manuallySelectedIntent,
            })
        },
        [humanMessage, manuallySelectedIntent, setManuallySelectedIntent]
    )

    // We track, ephemerally, the code blocks that are being regenerated so
    // we can show an accurate loading indicator or error message on those
    // blocks.
    const [regeneratingCodeBlocks, setRegeneratingCodeBlocks] = useState<RegeneratingCodeBlockState[]>(
        []
    )
    useClientActionListener(
        { isActive: true, selector: event => Boolean(event.regenerateStatus) },
        useCallback(event => {
            setRegeneratingCodeBlocks(blocks => {
                switch (event.regenerateStatus?.status) {
                    case 'done': {
                        // A block is done, so remove it from the list of generating blocks.
                        const regenerateStatus = event.regenerateStatus
                        return blocks.filter(block => block.id !== regenerateStatus.id).slice()
                    }
                    case 'error': {
                        // A block errored, so remove it from the list of generating blocks.
                        const regenerateStatus = event.regenerateStatus
                        return blocks
                            .map(block =>
                                block.id === regenerateStatus.id
                                    ? { ...block, error: regenerateStatus.error }
                                    : block
                            )
                            .slice()
                    }
                    default:
                        return blocks
                }
            })
        }, [])
    )

    const onRegenerate = useCallback(
        (code: string, language?: string) => {
            if (assistantMessage) {
                const id = uuid.v4()
                regenerateCodeBlock({ id, code, language, index: assistantMessage.index })
                setRegeneratingCodeBlocks(blocks => [
                    { id, index: assistantMessage.index, code, error: undefined },
                    ...blocks,
                ])
            } else {
                console.warn('tried to regenerate a code block, but there is no assistant message')
            }
        },
        [assistantMessage]
    )

    const isAgenticMode = useMemo(
        () => humanMessage?.manuallySelectedIntent === 'agentic' || humanMessage?.intent === 'agentic',
        [humanMessage?.intent, humanMessage?.manuallySelectedIntent]
    )

    const agentToolCalls = useMemo(() => {
        return assistantMessage?.contextFiles?.filter(f => f.type === 'tool-state')
    }, [assistantMessage?.contextFiles])

    return (
        <>
            {/* Show loading state on the last interaction */}
            {isLastInteraction && priorAssistantMessageIsLoading && <LoadingDots />}
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
            {!isAgenticMode && (
                <>
                    {omniboxEnabled && assistantMessage?.didYouMeanQuery && (
                        <DidYouMeanNotice
                            query={assistantMessage?.didYouMeanQuery}
                            disabled={!!assistantMessage?.isLoading}
                            switchToSearch={() =>
                                editAndSubmitSearch(assistantMessage?.didYouMeanQuery ?? '')
                            }
                        />
                    )}
                    {!usingToolCody && !isSearchIntent && humanMessage.agent && (
                        <AgenticContextCell
                            key={`${humanMessage.index}-${humanMessage.intent}-process`}
                            isContextLoading={isContextLoading}
                            processes={humanMessage?.processes ?? undefined}
                        />
                    )}
                    {humanMessage.agent && assistantMessage?.isLoading && (
                        <ApprovalCell vscodeAPI={vscodeAPI} />
                    )}
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
                </>
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
                        onRegenerate={onRegenerate}
                        regeneratingCodeBlocks={regeneratingCodeBlocks}
                        postMessage={postMessage}
                        guardrails={guardrails}
                        humanMessage={humanMessageInfo}
                        isLoading={isLastSentInteraction && assistantMessage.isLoading}
                        smartApply={isAgenticMode ? undefined : smartApplyWithInstruction}
                        onSelectedFiltersUpdate={onSelectedFiltersUpdate}
                        isLastSentInteraction={isLastSentInteraction}
                        setThoughtProcessOpened={setThoughtProcessOpened}
                        isThoughtProcessOpened={isThoughtProcessOpened}
                    />
                )}
            {/* Shows tool contents instead of editor if any */}
            {agentToolCalls?.map(tool => (
                <ToolStatusCell
                    key={tool.toolId}
                    title={tool.toolName}
                    output={tool}
                    className="w-full"
                />
            ))}
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

export function regenerateCodeBlock({
    id,
    code,
    language,
    index,
}: {
    id: string
    code: string
    language?: string
    index: number
}) {
    getVSCodeAPI().postMessage({
        command: 'regenerateCodeBlock',
        id,
        code,
        language,
        index,
    })
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
