import {
    type ChatMessage,
    ContextItemSource,
    type Guardrails,
    contextItemsFromPromptEditorValue,
    filterContextItemsFromPromptEditorValue,
    ps,
    reformatBotMessageForChat,
    serializedPromptEditorStateFromChatMessage,
} from '@sourcegraph/cody-shared'
import { type FunctionComponent, type RefObject, useMemo } from 'react'
import type { ApiPostMessage, UserAccountInfo } from '../../../../Chat'
import { chatModelIconComponent } from '../../../../components/ChatModelIcon'
import type { PromptEditorRefAPI } from '../../../../promptEditor/PromptEditor'
import { ChatMessageContent, type CodeBlockActionsProps } from '../../../ChatMessageContent'
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
    isLoading: boolean

    showFeedbackButtons: boolean
    feedbackButtonsOnSubmit?: (text: string) => void

    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']

    postMessage?: ApiPostMessage
    guardrails?: Guardrails
}> = ({
    message,
    humanMessage,
    userInfo,
    isLoading,
    showFeedbackButtons,
    feedbackButtonsOnSubmit,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    postMessage,
    guardrails,
}) => {
    const displayMarkdown = useMemo(
        () => reformatBotMessageForChat(message.text ?? ps``).toString(),
        [message]
    )

    const chatModel = useChatModelByID(message.model)
    const ModelIcon = chatModel ? chatModelIconComponent(chatModel.model) : null

    return (
        <BaseMessageCell
            speaker={message.speaker}
            speakerIcon={
                chatModel && ModelIcon ? (
                    <span title={`${chatModel.title} by ${chatModel.provider}`}>
                        <ModelIcon size={NON_HUMAN_CELL_AVATAR_SIZE} />
                    </span>
                ) : null
            }
            content={
                <>
                    {message.error ? (
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
                        />
                    ) : (
                        isLoading && <LoadingDots />
                    )}
                </>
            }
            footer={
                ((showFeedbackButtons && feedbackButtonsOnSubmit) || humanMessage) && (
                    <div className="tw-flex tw-items-center tw-py-3 tw-divide-x tw-transition tw-divide-muted tw-opacity-65 hover:tw-opacity-100">
                        {showFeedbackButtons && feedbackButtonsOnSubmit && (
                            <FeedbackButtons
                                feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                                className="tw-pr-4"
                            />
                        )}
                        {humanMessage && !isLoading && (
                            <ContextFocusActions humanMessage={humanMessage} className="tw-pl-5" />
                        )}
                    </div>
                )
            }
        />
    )
}

export const NON_HUMAN_CELL_AVATAR_SIZE =
    MESSAGE_CELL_AVATAR_SIZE * 0.83 /* make them "look" the same size as the human avatar icons */

export interface HumanMessageInitialContextInfo {
    repositories: boolean
    files: boolean
}

export interface PriorHumanMessageInfo {
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
