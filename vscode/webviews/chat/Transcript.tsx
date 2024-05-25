import { type ChatMessage, type ContextItem, type Guardrails, isDefined } from '@sourcegraph/cody-shared'
import type React from 'react'
import type { UserAccountInfo } from '../Chat'
import type { ApiPostMessage } from '../Chat'
import type { SerializedPromptEditorValue } from '../promptEditor/PromptEditor'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import type { CodeBlockActionsProps } from './ChatMessageContent'
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
                    onSubmit={(
                        editorValue: SerializedPromptEditorValue,
                        addEnhancedContext: boolean
                    ): void => {
                        getVSCodeAPI().postMessage({
                            command: 'edit',
                            index: messageIndexInTranscript,
                            text: editorValue.text,
                            editorState: editorValue.editorState,
                            contextFiles: editorValue.contextItems,
                            addEnhancedContext,
                        })
                    }}
                    // Keep the editor focused after hitting enter on a not-yet-isSent message. This
                    // lets the user edit and resend the message while they're waiting for the
                    // response to finish.
                    isEditorInitiallyFocused={isLastHumanMessage}
                />,
                (message.contextFiles && message.contextFiles.length > 0) || isLastMessage ? (
                    <ContextCell
                        key={`${messageIndexInTranscript}-context`}
                        contextFiles={message.contextFiles}
                    />
                ) : null,
            ].filter(isDefined)
        ) : (
            <AssistantMessageCell
                key={messageIndexInTranscript}
                message={message}
                userInfo={userInfo}
                isLoading={isLoading}
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

    return (
        <>
            {transcript.flatMap(messageToTranscriptItem)}
            {messageInProgress &&
                messageInProgress.speaker === 'assistant' &&
                transcript.at(-1)?.contextFiles && (
                    <AssistantMessageCell
                        message={messageInProgress}
                        isLoading={true}
                        showFeedbackButtons={false}
                        copyButtonOnSubmit={copyButtonOnSubmit}
                        insertButtonOnSubmit={insertButtonOnSubmit}
                        postMessage={postMessage}
                        userInfo={userInfo}
                    />
                )}
            {!messageInProgress && !isLastAssistantMessageError(transcript) && (
                <HumanMessageCell
                    message={null}
                    isFirstMessage={transcript.length === 0}
                    isSent={false}
                    isPendingResponse={false}
                    userInfo={userInfo}
                    chatEnabled={chatEnabled}
                    isEditorInitiallyFocused={true}
                    userContextFromSelection={userContextFromSelection}
                    onSubmit={(
                        editorValue: SerializedPromptEditorValue,
                        addEnhancedContext: boolean
                    ): void => {
                        getVSCodeAPI().postMessage({
                            command: 'submit',
                            submitType: 'user',
                            text: editorValue.text,
                            editorState: editorValue.editorState,
                            contextFiles: editorValue.contextItems,
                            addEnhancedContext,
                        })
                    }}
                />
            )}
            {transcript.length === 0 && <WelcomeMessage />}
        </>
    )
}

function isLastAssistantMessageError(transcript: readonly ChatMessage[]): boolean {
    const lastMessage = transcript.at(-1)
    return Boolean(lastMessage && lastMessage.speaker === 'assistant' && lastMessage.error !== undefined)
}
