import {
    type ChatMessage,
    type ContextItem,
    ContextItemSource,
    type Guardrails,
    isDefined,
} from '@sourcegraph/cody-shared'
import { type MutableRefObject, useCallback, useRef } from 'react'
import type { UserAccountInfo } from '../Chat'
import type { ApiPostMessage } from '../Chat'
import type { PromptEditorRefAPI, SerializedPromptEditorValue } from '../promptEditor/PromptEditor'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import type { CodeBlockActionsProps } from './ChatMessageContent'
import styles from './Transcript.module.css'
import { ContextCell } from './cells/contextCell/ContextCell'
import { AssistantMessageCell } from './cells/messageCell/assistant/AssistantMessageCell'
import { HumanMessageCell } from './cells/messageCell/human/HumanMessageCell'
import { WelcomeMessage } from './components/WelcomeMessage'

export const Transcript: React.FunctionComponent<{
    transcript: ChatMessage[]
    messageInProgress: ChatMessage | null
    feedbackButtonsOnSubmit: (text: string) => void
    copyButtonOnSubmit: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit: CodeBlockActionsProps['insertButtonOnSubmit']
    isTranscriptError?: boolean
    userInfo: UserAccountInfo
    chatEnabled?: boolean
    userContextFromSelection?: ContextItem[]
    postMessage?: ApiPostMessage
    guardrails?: Guardrails
}> = ({
    transcript,
    messageInProgress,
    feedbackButtonsOnSubmit,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    isTranscriptError,
    userInfo,
    chatEnabled = true,
    userContextFromSelection,
    postMessage,
    guardrails,
}) => {
    const editorRefs = useRef<MutableRefObject<PromptEditorRefAPI | null>[]>([])

    const messageToTranscriptItem = (
        message: ChatMessage,
        messageIndexInTranscript: number
    ): JSX.Element | JSX.Element[] | null => {
        if (!message.text && !message.error) {
            return null
        }

        const isLoading = Boolean(
            messageInProgress && messageInProgress.speaker === 'assistant' && !messageInProgress.text
        )
        const isLastMessage = messageIndexInTranscript === transcript.length - 1
        const isLastHumanMessage =
            message.speaker === 'human' &&
            (messageIndexInTranscript === transcript.length - 1 ||
                messageIndexInTranscript === transcript.length - 2)

        const priorHumanMessageIndex = messageIndexInTranscript - 1
        const priorHumanMessage =
            message.speaker === 'assistant' ? transcript.at(priorHumanMessageIndex) : undefined
        const nextAssistantMessage =
            message.speaker === 'human' ? transcript.at(messageIndexInTranscript + 1) : undefined

        return message.speaker === 'human' ? (
            [
                <HumanMessageCell
                    key={messageIndexInTranscript}
                    message={message}
                    userInfo={userInfo}
                    chatEnabled={chatEnabled}
                    isFirstMessage={messageIndexInTranscript === 0}
                    isSent={true}
                    isPendingResponse={isLastHumanMessage && isLoading}
                    isPendingPriorResponse={false}
                    onSubmit={(
                        editorValue: SerializedPromptEditorValue,
                        addEnhancedContext: boolean
                    ): void => {
                        editHumanMessage(messageIndexInTranscript, editorValue, addEnhancedContext)
                    }}
                    editorRef={editorRefAtIndex(editorRefs.current, messageIndexInTranscript)}
                />,
                (message.contextFiles && message.contextFiles.length > 0) || isLastMessage ? (
                    <ContextCell
                        key={`${messageIndexInTranscript}-context`}
                        contextFiles={message.contextFiles}
                        model={nextAssistantMessage?.model}
                    />
                ) : null,
            ].filter(isDefined)
        ) : (
            <AssistantMessageCell
                key={messageIndexInTranscript}
                message={message}
                humanMessage={{
                    hasExplicitMentions: Boolean(
                        priorHumanMessage!.contextFiles?.some(
                            item => item.source === ContextItemSource.User
                        )
                    ),
                    addEnhancedContext: Boolean(
                        priorHumanMessage!.contextFiles?.some(
                            item =>
                                item.source === ContextItemSource.Unified ||
                                item.source === ContextItemSource.Embeddings ||
                                item.source === ContextItemSource.Search
                        )
                    ),
                    rerunWithEnhancedContext: (withEnhancedContext: boolean) => {
                        const editorValue = editorRefs.current
                            .at(priorHumanMessageIndex)
                            ?.current?.getSerializedValue()
                        if (editorValue) {
                            editHumanMessage(
                                messageIndexInTranscript - 1,
                                editorValue,
                                withEnhancedContext
                            )
                        }
                    },
                    appendAtMention: () => {
                        editorRefs.current.at(priorHumanMessageIndex)?.current?.appendText('@', true)
                    },
                }}
                userInfo={userInfo}
                isLoading={false}
                showFeedbackButtons={
                    messageIndexInTranscript !== 0 && !isTranscriptError && !message.error
                }
                feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                copyButtonOnSubmit={copyButtonOnSubmit}
                insertButtonOnSubmit={insertButtonOnSubmit}
                postMessage={postMessage}
                guardrails={guardrails}
            />
        )
    }

    const onFollowupSubmit = useCallback(
        (editorValue: SerializedPromptEditorValue, addEnhancedContext: boolean): void => {
            getVSCodeAPI().postMessage({
                command: 'submit',
                submitType: 'user',
                text: editorValue.text,
                editorState: editorValue.editorState,
                contextFiles: editorValue.contextItems,
                addEnhancedContext,
            })
        },
        []
    )

    return (
        <>
            {transcript.flatMap(messageToTranscriptItem)}
            {messageInProgress &&
                messageInProgress.speaker === 'assistant' &&
                transcript.at(-1)?.contextFiles && (
                    <AssistantMessageCell
                        message={messageInProgress}
                        humanMessage={null}
                        isLoading={true}
                        showFeedbackButtons={false}
                        copyButtonOnSubmit={copyButtonOnSubmit}
                        insertButtonOnSubmit={insertButtonOnSubmit}
                        postMessage={postMessage}
                        userInfo={userInfo}
                    />
                )}
            {!isLastAssistantMessageError(transcript) && (
                <HumanMessageCell
                    key={transcript.length + (messageInProgress ? 1 : 0)}
                    message={null}
                    isFirstMessage={transcript.length === 0}
                    isSent={false}
                    isPendingResponse={false}
                    isPendingPriorResponse={messageInProgress !== null}
                    userInfo={userInfo}
                    chatEnabled={chatEnabled}
                    isEditorInitiallyFocused={true}
                    userContextFromSelection={userContextFromSelection}
                    onSubmit={onFollowupSubmit}
                    className={styles.lastHumanMessage}
                />
            )}
            {transcript.length === 0 && <WelcomeMessage />}
        </>
    )
}

function editorRefAtIndex(
    editorRefs: MutableRefObject<PromptEditorRefAPI | null>[],
    i: number
): MutableRefObject<PromptEditorRefAPI | null> {
    let ref = editorRefs.at(i)
    if (ref === undefined) {
        ref = { current: null }
        editorRefs[i] = ref
    }
    return ref
}

function isLastAssistantMessageError(transcript: readonly ChatMessage[]): boolean {
    const lastMessage = transcript.at(-1)
    return Boolean(lastMessage && lastMessage.speaker === 'assistant' && lastMessage.error !== undefined)
}

// TODO(sqs): Do this the React-y way.
export function focusLastHumanMessageEditor(): void {
    const elements = document.querySelectorAll<HTMLElement>('[data-lexical-editor]')
    const lastEditor = elements.item(elements.length - 1)
    lastEditor?.focus()
}

function editHumanMessage(
    messageIndexInTranscript: number,
    editorValue: SerializedPromptEditorValue,
    addEnhancedContext: boolean
): void {
    getVSCodeAPI().postMessage({
        command: 'edit',
        index: messageIndexInTranscript,
        text: editorValue.text,
        editorState: editorValue.editorState,
        contextFiles: editorValue.contextItems,
        addEnhancedContext,
    })
    focusLastHumanMessageEditor()
}
