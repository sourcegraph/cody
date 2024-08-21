import {
    type ChatMessage,
    ContextItemSource,
    type Guardrails,
    type PromptString,
    contextItemsFromPromptEditorValue,
    filterContextItemsFromPromptEditorValue,
    isAbortErrorOrSocketHangUp,
    ps,
    reformatBotMessageForChat,
    serializedPromptEditorStateFromChatMessage,
} from '@sourcegraph/cody-shared'
import type { PromptEditorRefAPI } from '@sourcegraph/prompt-editor'
import isEqual from 'lodash/isEqual'
import { type FunctionComponent, type RefObject, memo, useMemo } from 'react'
import type { ApiPostMessage, UserAccountInfo } from '../../../../Chat'
import { chatModelIconComponent } from '../../../../components/ChatModelIcon'
import {
    ChatMessageContent,
    type CodeBlockActionsProps,
} from '../../../ChatMessageContent/ChatMessageContent'
import { ErrorItem, RequestErrorItem } from '../../../ErrorItem'
import { type Interaction, editHumanMessage } from '../../../Transcript'
import { FeedbackButtons } from '../../../components/FeedbackButtons'
import { LoadingDots } from '../../../components/LoadingDots'
import { useChatModelByID } from '../../../models/chatModelContext'
import { BaseMessageCell, MESSAGE_CELL_AVATAR_SIZE } from '../BaseMessageCell'
import { ContextFocusActions } from './ContextFocusActions'

/**
 * A component that displays a chat message from the assistant.
 */
export const AssistantMessageCell: FunctionComponent<{
    message: ChatMessage

    /** Information about the human message that led to this assistant response. */
    humanMessage: PriorHumanMessageInfo | null

    userInfo: UserAccountInfo
    chatEnabled: boolean
    isLoading: boolean

    showFeedbackButtons: boolean
    feedbackButtonsOnSubmit?: (text: string) => void

    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']

    smartApplyEnabled?: boolean
    smartApply?: CodeBlockActionsProps['smartApply']

    postMessage?: ApiPostMessage
    guardrails?: Guardrails
}> = memo(
    ({
        message,
        humanMessage,
        userInfo,
        chatEnabled,
        isLoading,
        showFeedbackButtons,
        feedbackButtonsOnSubmit,
        copyButtonOnSubmit,
        insertButtonOnSubmit,
        postMessage,
        guardrails,
        smartApply,
        smartApplyEnabled,
    }) => {
        const displayMarkdown = useMemo(
            () => reformatBotMessageForChat(message.text ?? ps``).toString(),
            [message]
        )

        const chatModel = useChatModelByID(message.model)
        const ModelIcon = chatModel ? chatModelIconComponent(chatModel.id) : null
        const isAborted = isAbortErrorOrSocketHangUp(message.error)

        return (
            <BaseMessageCell
                speakerIcon={ModelIcon ? <ModelIcon size={NON_HUMAN_CELL_AVATAR_SIZE} /> : null}
                speakerTitle={
                    <span data-testid="chat-model">
                        {chatModel
                            ? chatModel.title ?? `Model ${chatModel.id} by ${chatModel.provider}`
                            : 'Model'}
                    </span>
                }
                content={
                    <>
                        {message.error && !isAborted ? (
                            typeof message.error === 'string' ? (
                                <RequestErrorItem error={message.error} />
                            ) : (
                                <ErrorItem
                                    error={message.error}
                                    userInfo={userInfo}
                                    postMessage={postMessage}
                                />
                            )
                        ) : null}
                        {displayMarkdown ? (
                            <ChatMessageContent
                                displayMarkdown={displayMarkdown}
                                isMessageLoading={isLoading}
                                copyButtonOnSubmit={copyButtonOnSubmit}
                                insertButtonOnSubmit={insertButtonOnSubmit}
                                guardrails={guardrails}
                                humanMessage={humanMessage}
                                smartApplyEnabled={smartApplyEnabled}
                                smartApply={smartApply}
                                userInfo={userInfo}
                            />
                        ) : (
                            isLoading && <LoadingDots />
                        )}
                    </>
                }
                footer={
                    chatEnabled &&
                    humanMessage && (
                        <div className="tw-py-3 tw-flex tw-flex-col tw-gap-2">
                            {isAborted && (
                                <div className="tw-text-sm tw-text-muted-foreground tw-mt-4">
                                    Output stream stopped
                                </div>
                            )}
                            <div className="tw-flex tw-items-center tw-divide-x tw-transition tw-divide-muted tw-opacity-65 hover:tw-opacity-100">
                                {showFeedbackButtons && feedbackButtonsOnSubmit && (
                                    <FeedbackButtons
                                        feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                                        className="tw-pr-4"
                                    />
                                )}
                                {!isLoading && (!message.error || isAborted) && (
                                    <ContextFocusActions
                                        humanMessage={humanMessage}
                                        className={
                                            showFeedbackButtons && feedbackButtonsOnSubmit
                                                ? 'tw-pl-5'
                                                : undefined
                                        }
                                    />
                                )}
                            </div>
                        </div>
                    )
                }
            />
        )
    },
    isEqual
)

export const NON_HUMAN_CELL_AVATAR_SIZE =
    MESSAGE_CELL_AVATAR_SIZE * 0.83 /* make them "look" the same size as the human avatar icons */

export interface HumanMessageInitialContextInfo {
    repositories: boolean
    files: boolean
}

export interface PriorHumanMessageInfo {
    text?: PromptString
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
                editHumanMessage(assistantMessage.index - 1, newEditorValue)
            }
        },
        hasExplicitMentions: Boolean(contextItems.some(item => item.source === ContextItemSource.User)),
        appendAtMention: () => {
            if (humanEditorRef.current?.getSerializedValue().text.trim().endsWith('@')) {
                humanEditorRef.current?.setFocus(true, { moveCursorToEnd: true })
            } else {
                humanEditorRef.current?.appendText('@', true)
            }
        },
    }
}
