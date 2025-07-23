import {
    type ChatMessage,
    ContextItemSource,
    type Guardrails,
    type Model,
    ModelTag,
    type PromptString,
    contextItemsFromPromptEditorValue,
    filterContextItemsFromPromptEditorValue,
    isAbortErrorOrSocketHangUp,
    reformatBotMessageForChat,
    serializedPromptEditorStateFromChatMessage,
} from '@sourcegraph/cody-shared'
import { DeepCodyAgentID } from '@sourcegraph/cody-shared/src/models/client'
import type { PromptEditorRefAPI } from '@sourcegraph/prompt-editor'
import isEqual from 'lodash/isEqual'
import { type FunctionComponent, type RefObject, memo, useMemo } from 'react'
import type { ApiPostMessage, UserAccountInfo } from '../../../../Chat'
import {
    ChatMessageContent,
    type CodeBlockActionsProps,
} from '../../../ChatMessageContent/ChatMessageContent'

import styles from '../../../ChatMessageContent/ChatMessageContent.module.css'
import { CopyButton } from '../../../ChatMessageContent/EditButtons'
import { ErrorItem, RequestErrorItem } from '../../../ErrorItem'
import { TokenUsageDisplay } from '../../../TokenUsageDisplay'
import { type Interaction, editHumanMessage } from '../../../Transcript'
import { BaseMessageCell } from '../BaseMessageCell'
import { SubMessageCell } from './SubMessageCell'

/**
 * A component that displays a chat message from the assistant.
 */
export const AssistantMessageCell: FunctionComponent<{
    message: ChatMessage
    models: Model[]
    /** Information about the human message that led to this assistant response. */
    humanMessage: PriorHumanMessageInfo | null

    userInfo: UserAccountInfo
    chatEnabled: boolean
    chatCodeHighlightingEnabled: boolean
    isLoading: boolean

    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
    onRegenerate: CodeBlockActionsProps['onRegenerate']
    regeneratingCodeBlocks: CodeBlockActionsProps['regeneratingCodeBlocks']

    smartApply?: CodeBlockActionsProps['smartApply']

    isThoughtProcessOpened?: boolean
    setThoughtProcessOpened?: (open: boolean) => void

    postMessage?: ApiPostMessage
    guardrails: Guardrails
    isLastSentInteraction: boolean
}> = memo(
    ({
        message,
        models,
        humanMessage,
        userInfo,
        chatEnabled,
        chatCodeHighlightingEnabled,
        isLoading,
        copyButtonOnSubmit,
        insertButtonOnSubmit,
        onRegenerate,
        regeneratingCodeBlocks,
        postMessage,
        guardrails,
        smartApply,
        isLastSentInteraction: isLastInteraction,
        isThoughtProcessOpened,
        setThoughtProcessOpened,
    }) => {
        const displayMarkdown = useMemo(
            () => (message.text ? reformatBotMessageForChat(message.text).toString() : ''),
            [message.text]
        )
        const chatModel = useChatModelByID(message.model, models)
        const isAborted = isAbortErrorOrSocketHangUp(message.error)

        const hasLongerResponseTime = chatModel?.tags?.includes(ModelTag.StreamDisabled)

        const messageIntent = humanMessage?.intent ?? message.intent ?? 'chat'
        const isSearchIntent = messageIntent === 'search'

        return (
            <BaseMessageCell
                content={
                    <>
                        {message.error && !isAborted ? (
                            typeof message.error === 'string' ? (
                                <RequestErrorItem error={message.error} humanMessage={humanMessage} />
                            ) : (
                                <ErrorItem
                                    error={message.error}
                                    postMessage={postMessage}
                                    humanMessage={humanMessage}
                                />
                            )
                        ) : null}
                        {!isSearchIntent && displayMarkdown ? (
                            <ChatMessageContent
                                displayMarkdown={displayMarkdown}
                                isMessageLoading={isLoading}
                                copyButtonOnSubmit={copyButtonOnSubmit}
                                insertButtonOnSubmit={insertButtonOnSubmit}
                                onRegenerate={onRegenerate}
                                regeneratingCodeBlocks={regeneratingCodeBlocks}
                                guardrails={guardrails}
                                humanMessage={humanMessage}
                                smartApply={smartApply}
                                chatCodeHighlightingEnabled={chatCodeHighlightingEnabled}
                                isThoughtProcessOpened={!!isThoughtProcessOpened}
                                setThoughtProcessOpened={setThoughtProcessOpened}
                            />
                        ) : (
                            isLoading &&
                            message.subMessages === undefined && (
                                <div>
                                    {hasLongerResponseTime && (
                                        <p className="tw-m-4 tw-mt-0 tw-text-muted-foreground">
                                            This model may take longer to respond because it takes time
                                            to "think". Recommended for complex reasoning & coding tasks.
                                        </p>
                                    )}
                                </div>
                            )
                        )}
                        {message.subMessages?.length &&
                            message.subMessages.length > 0 &&
                            message.subMessages.map((piece, i) => (
                                <SubMessageCell
                                    // biome-ignore lint/suspicious/noArrayIndexKey:
                                    key={`piece-${i}`}
                                    piece={piece}
                                    guardrails={guardrails}
                                    onRegenerate={onRegenerate}
                                    regeneratingCodeBlocks={regeneratingCodeBlocks}
                                />
                            ))}
                    </>
                }
                footer={
                    <div className="tw-py-3 tw-flex tw-flex-col tw-gap-2">
                        {isAborted && (
                            <div className="tw-py-3 tw-flex tw-flex-col tw-gap-2">
                                <div className="tw-text-sm tw-text-muted-foreground tw-mt-4">
                                    Output stream stopped
                                </div>
                            </div>
                        )}
                        {!isLoading &&
                            (!message.error || isAborted) &&
                            // Do not display copy button for non-chat mode.
                            // NOTE: Empty intent is defaulted to chat.
                            messageIntent === 'chat' && (
                                <div
                                    className={`tw-flex tw-items-center tw-justify-end tw-gap-4  ${styles.buttonsContainer}`}
                                >
                                    <CopyButton
                                        text={message.text?.toString() || ''}
                                        onCopy={copyButtonOnSubmit}
                                        showLabel={false}
                                        className={'tw-transition tw-opacity-65 hover:tw-opacity-100'}
                                        title="Copy Message"
                                    />
                                </div>
                            )}
                        <TokenUsageDisplay tokenUsage={message.tokenUsage} />
                    </div>
                }
                speaker="assistant"
            />
        )
    },
    isEqual
)

export interface HumanMessageInitialContextInfo {
    repositories: boolean
    files: boolean
}

export interface PriorHumanMessageInfo {
    text?: PromptString
    intent?: ChatMessage['intent']
    hasInitialContext: HumanMessageInitialContextInfo
    rerunWithDifferentContext: (withInitialContext: HumanMessageInitialContextInfo) => void

    hasExplicitMentions: boolean
    appendAtMention: () => void
}

export function makeHumanMessageInfo(
    { humanMessage, assistantMessage }: Interaction,
    humanEditorRef: RefObject<PromptEditorRefAPI>
): PriorHumanMessageInfo {
    if (assistantMessage === null) {
        throw new Error('unreachable')
    }

    const editorValue = serializedPromptEditorStateFromChatMessage(humanMessage)
    const contextItems = contextItemsFromPromptEditorValue(editorValue)

    return {
        text: humanMessage.text,
        intent: humanMessage.intent,
        hasInitialContext: {
            repositories: Boolean(
                contextItems.some(item => item.type === 'repository' || item.type === 'tree')
            ),
            files: Boolean(
                contextItems.some(
                    item => item.type === 'file' && item.source === ContextItemSource.Initial
                )
            ),
        },
        rerunWithDifferentContext: withInitialContext => {
            const editorValue = humanEditorRef.current?.getSerializedValue()
            if (editorValue) {
                const newEditorValue = filterContextItemsFromPromptEditorValue(
                    editorValue,
                    item =>
                        ((item.type === 'repository' || item.type === 'tree') &&
                            withInitialContext.repositories) ||
                        (item.type === 'file' && withInitialContext.files)
                )
                editHumanMessage({
                    messageIndexInTranscript: assistantMessage.index - 1,
                    editorValue: newEditorValue,
                })
            }
        },
        hasExplicitMentions: Boolean(contextItems.some(item => item.source === ContextItemSource.User)),
        appendAtMention: () => {
            if (humanEditorRef.current?.getSerializedValue().text.trim().endsWith('@')) {
                humanEditorRef.current?.setFocus(true, { moveCursorToEnd: true })
            } else {
                humanEditorRef.current?.appendText('@')
            }
        },
    }
}

function useChatModelByID(
    model: string | undefined,
    chatModels: Model[]
): Pick<Model, 'id' | 'title' | 'provider' | 'tags'> | undefined {
    return (
        chatModels?.find(m => m.id === model) ??
        (model
            ? {
                  id: model,
                  title: model?.includes(DeepCodyAgentID) ? 'Deep Cody (Experimental)' : model,
                  provider: 'unknown',
                  tags: [],
              }
            : undefined)
    )
}
