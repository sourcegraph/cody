import type React from 'react'
import { useCallback, useState } from 'react'

import { VSCodeButton, VSCodeLink } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import type {
    ChatInputHistory,
    ChatMessage,
    ContextItem,
    Guardrails,
    ModelProvider,
    TelemetryService,
} from '@sourcegraph/cody-shared'
import {
    type ChatButtonProps,
    type ChatUISubmitButtonProps,
    type ChatUITextAreaProps,
    type EditButtonProps,
    type FeedbackButtonsProps,
    LibChat,
    type UserAccountInfo,
    type WebviewChatSubmitType,
} from './LibChat'
import type { CodeBlockMeta } from './chat/CodeBlocks'
import { TextArea } from './chat/TextArea'
import { useEnhancedContextEnabled } from './chat/components/EnhancedContext'

import { CODY_FEEDBACK_URL } from '../src/chat/protocol'

import { ChatModelDropdownMenu } from './Components/ChatModelDropdownMenu'
import { EnhancedContextSettings } from './Components/EnhancedContextSettings'
import { FileLink } from './Components/FileLink'
import { SymbolLink } from './SymbolLink'
import { UserContextSelectorComponent } from './UserContextSelector'
import { type VSCodeWrapper, getVSCodeAPI } from './utils/VSCodeApi'

import { verifyContextFilesFromInput } from '@sourcegraph/cody-shared/src/chat/input/user-context'
import styles from './Chat.module.css'

interface ChatboxProps {
    welcomeMessage?: string
    chatEnabled: boolean
    messageInProgress: ChatMessage | null
    messageBeingEdited: number | undefined
    setMessageBeingEdited: (index?: number) => void
    transcript: ChatMessage[]
    formInput: string
    setFormInput: (input: string) => void
    inputHistory: ChatInputHistory[]
    setInputHistory: (history: ChatInputHistory[]) => void
    vscodeAPI: VSCodeWrapper
    telemetryService: TelemetryService
    isTranscriptError: boolean
    contextSelection?: ContextItem[] | null
    setContextSelection: (context: ContextItem[] | null) => void
    setChatModels?: (models: ModelProvider[]) => void
    chatModels?: ModelProvider[]
    userInfo: UserAccountInfo
    guardrails?: Guardrails
    chatIDHistory: string[]
    isWebviewActive: boolean
}
export const Chat: React.FunctionComponent<React.PropsWithChildren<ChatboxProps>> = ({
    welcomeMessage,
    messageInProgress,
    messageBeingEdited,
    setMessageBeingEdited,
    transcript,
    formInput,
    setFormInput,
    inputHistory,
    setInputHistory,
    vscodeAPI,
    telemetryService,
    isTranscriptError,
    contextSelection,
    setContextSelection,
    setChatModels,
    chatModels,
    chatEnabled,
    userInfo,
    guardrails,
    chatIDHistory,
    isWebviewActive,
}) => {
    const abortMessageInProgress = useCallback(() => {
        vscodeAPI.postMessage({ command: 'abort' })
    }, [vscodeAPI])

    const addEnhancedContext = useEnhancedContextEnabled()

    const onEditSubmit = useCallback(
        (text: string, index: number, contextFiles: ContextItem[]) => {
            vscodeAPI.postMessage({
                command: 'edit',
                index,
                text,
                addEnhancedContext,
                contextFiles,
            })
        },
        [addEnhancedContext, vscodeAPI]
    )

    const onSubmit = useCallback(
        (text: string, submitType: WebviewChatSubmitType, contextFiles?: Map<string, ContextItem>) => {
            // loop the added contextFiles to:
            // 1. check if the key still exists in the text
            // 2. remove the ones not present
            const userContextFiles = verifyContextFilesFromInput(text, contextFiles)

            // Handle edit requests
            if (submitType === 'edit') {
                if (messageBeingEdited !== undefined) {
                    onEditSubmit(text, messageBeingEdited, userContextFiles)
                }
                return
            }

            vscodeAPI.postMessage({
                command: 'submit',
                submitType,
                text,
                addEnhancedContext,
                contextFiles: userContextFiles,
            })
        },
        [addEnhancedContext, messageBeingEdited, onEditSubmit, vscodeAPI]
    )

    const onCurrentChatModelChange = useCallback(
        (selected: ModelProvider): void => {
            if (!chatModels || !setChatModels) {
                return
            }
            vscodeAPI.postMessage({
                command: 'chatModel',
                model: selected.model,
            })
            const updatedChatModels = chatModels.map(m =>
                m.model === selected.model ? { ...m, default: true } : { ...m, default: false }
            )
            setChatModels(updatedChatModels)
        },
        [chatModels, setChatModels, vscodeAPI]
    )

    const onFeedbackBtnClick = useCallback(
        (text: string) => {
            const eventData = {
                value: text,
                lastChatUsedEmbeddings: Boolean(
                    transcript.at(-1)?.contextFiles?.some(file => file.source === 'embeddings')
                ),
                transcript: '',
            }

            if (userInfo.isDotComUser) {
                eventData.transcript = JSON.stringify(transcript)
            }

            telemetryService.log(`CodyVSCodeExtension:codyFeedback:${text}`, eventData)
        },
        [telemetryService, transcript, userInfo]
    )

    const onCopyBtnClick = useCallback(
        (text: string, eventType: 'Button' | 'Keydown' = 'Button', metadata?: CodeBlockMeta) => {
            const op = 'copy'
            // remove the additional /n added by the text area at the end of the text
            const code = eventType === 'Button' ? text.replace(/\n$/, '') : text
            // Log the event type and text to telemetry in chat view
            vscodeAPI.postMessage({
                command: op,
                eventType,
                text: code,
                metadata,
            })
        },
        [vscodeAPI]
    )

    const onInsertBtnClick = useCallback(
        (text: string, newFile = false, metadata?: CodeBlockMeta) => {
            const op = newFile ? 'newFile' : 'insert'
            const eventType = 'Button'
            // remove the additional /n added by the text area at the end of the text
            const code = eventType === 'Button' ? text.replace(/\n$/, '') : text
            // Log the event type and text to telemetry in chat view
            vscodeAPI.postMessage({
                command: op,
                eventType,
                text: code,
                metadata,
            })
        },
        [vscodeAPI]
    )

    return (
        <LibChat
            messageInProgress={messageInProgress}
            messageBeingEdited={messageBeingEdited}
            setMessageBeingEdited={setMessageBeingEdited}
            transcript={transcript}
            formInput={formInput}
            setFormInput={setFormInput}
            inputHistory={inputHistory}
            setInputHistory={setInputHistory}
            onSubmit={onSubmit}
            textAreaComponent={VSCodeTextArea}
            submitButtonComponent={SubmitButton}
            fileLinkComponent={FileLink}
            symbolLinkComponent={SymbolLink}
            className={styles.innerContainer}
            codeBlocksCopyButtonClassName={styles.codeBlocksCopyButton}
            codeBlocksInsertButtonClassName={styles.codeBlocksInsertButton}
            transcriptItemClassName={styles.transcriptItem}
            humanTranscriptItemClassName={styles.humanTranscriptItem}
            transcriptItemParticipantClassName={styles.transcriptItemParticipant}
            transcriptActionClassName={styles.transcriptAction}
            inputRowClassName={styles.inputRow}
            chatInputClassName={styles.chatInputClassName}
            EditButtonContainer={EditButton}
            FeedbackButtonsContainer={FeedbackButtons}
            feedbackButtonsOnSubmit={onFeedbackBtnClick}
            copyButtonOnSubmit={onCopyBtnClick}
            insertButtonOnSubmit={onInsertBtnClick}
            onAbortMessageInProgress={abortMessageInProgress}
            isTranscriptError={isTranscriptError}
            // TODO: We should fetch this from the server and pass a pretty component
            // down here to render cody is disabled on the instance nicely.
            isCodyEnabled={true}
            codyNotEnabledNotice={undefined}
            afterMarkdown={welcomeMessage}
            helpMarkdown=""
            ChatButtonComponent={ChatButton}
            contextSelection={contextSelection}
            setContextSelection={setContextSelection}
            UserContextSelectorComponent={UserContextSelectorComponent}
            chatModels={chatModels}
            onCurrentChatModelChange={onCurrentChatModelChange}
            ChatModelDropdownMenu={ChatModelDropdownMenu}
            userInfo={userInfo}
            chatEnabled={chatEnabled}
            EnhancedContextSettings={EnhancedContextSettings}
            postMessage={msg => vscodeAPI.postMessage(msg)}
            guardrails={guardrails}
            chatIDHistory={chatIDHistory}
            isWebviewActive={isWebviewActive}
        />
    )
}

const ChatButton: React.FunctionComponent<ChatButtonProps> = ({
    label,
    action,
    onClick,
    appearance,
}) => (
    <VSCodeButton
        type="button"
        onClick={() => onClick(action)}
        className={styles.chatButton}
        appearance={appearance}
    >
        {label}
    </VSCodeButton>
)

const VSCodeTextArea: React.FunctionComponent<
    Omit<ChatUITextAreaProps, 'containerClassName' | 'inputClassName' | 'disabledClassName'>
> = props => (
    <TextArea
        {...props}
        containerClassName={styles.chatInputContainer}
        inputClassName={styles.chatInput}
        disabledClassName={styles.textareaDisabled}
    />
)

const submitButtonTypes = {
    user: { icon: 'codicon codicon-arrow-up', title: 'Send Message' },
    edit: { icon: 'codicon codicon-check', title: 'Update Message' },
    'user-newchat': {
        icon: 'codicon codicon-add',
        title: 'Start New Chat Session',
    },
    abort: { icon: 'codicon codicon-debug-stop', title: 'Stop Generating' },
}

const SubmitButton: React.FunctionComponent<ChatUISubmitButtonProps> = ({
    type = 'user',
    className,
    disabled,
    onClick,
    onAbortMessageInProgress,
}) => (
    <VSCodeButton
        className={classNames(styles.submitButton, className, disabled && styles.submitButtonDisabled)}
        type="button"
        disabled={disabled}
        onClick={onAbortMessageInProgress ?? onClick}
        title={onAbortMessageInProgress ? submitButtonTypes.abort.title : submitButtonTypes[type]?.title}
    >
        <i
            className={
                onAbortMessageInProgress ? submitButtonTypes.abort.icon : submitButtonTypes[type]?.icon
            }
        />
    </VSCodeButton>
)

const EditButton: React.FunctionComponent<EditButtonProps> = ({
    className,
    messageBeingEdited,
    setMessageBeingEdited,
    disabled,
}) => (
    <VSCodeButton
        className={classNames(styles.editButton, className)}
        appearance="icon"
        title={disabled ? 'Cannot Edit Command' : 'Edit Your Message'}
        type="button"
        disabled={disabled}
        onClick={() => {
            setMessageBeingEdited(messageBeingEdited)
            getVSCodeAPI().postMessage({
                command: 'event',
                eventName: 'CodyVSCodeExtension:chatEditButton:clicked',
                properties: { source: 'chat' },
            })
        }}
    >
        <i className="codicon codicon-edit" />
    </VSCodeButton>
)

const FeedbackButtons: React.FunctionComponent<FeedbackButtonsProps> = ({
    className,
    feedbackButtonsOnSubmit,
}) => {
    const [feedbackSubmitted, setFeedbackSubmitted] = useState('')

    const onFeedbackBtnSubmit = useCallback(
        (text: string) => {
            feedbackButtonsOnSubmit(text)
            setFeedbackSubmitted(text)
        },
        [feedbackButtonsOnSubmit]
    )

    return (
        <div className={classNames(styles.feedbackButtons, className)}>
            {!feedbackSubmitted && (
                <>
                    <VSCodeButton
                        className={classNames(styles.feedbackButton)}
                        appearance="icon"
                        type="button"
                        onClick={() => onFeedbackBtnSubmit('thumbsUp')}
                    >
                        <i className="codicon codicon-thumbsup" />
                    </VSCodeButton>
                    <VSCodeButton
                        className={classNames(styles.feedbackButton)}
                        appearance="icon"
                        type="button"
                        onClick={() => onFeedbackBtnSubmit('thumbsDown')}
                    >
                        <i className="codicon codicon-thumbsdown" />
                    </VSCodeButton>
                </>
            )}
            {feedbackSubmitted === 'thumbsUp' && (
                <VSCodeButton
                    className={classNames(styles.feedbackButton)}
                    appearance="icon"
                    type="button"
                    disabled={true}
                    title="Thanks for your feedback"
                >
                    <i className="codicon codicon-thumbsup" />
                    <i className="codicon codicon-check" />
                </VSCodeButton>
            )}
            {feedbackSubmitted === 'thumbsDown' && (
                <span className={styles.thumbsDownFeedbackContainer}>
                    <VSCodeButton
                        className={classNames(styles.feedbackButton)}
                        appearance="icon"
                        type="button"
                        disabled={true}
                        title="Thanks for your feedback"
                    >
                        <i className="codicon codicon-thumbsdown" />
                        <i className="codicon codicon-check" />
                    </VSCodeButton>
                    <VSCodeLink
                        href={String(CODY_FEEDBACK_URL)}
                        target="_blank"
                        title="Help improve Cody by providing more feedback about the quality of this response"
                    >
                        Give Feedback
                    </VSCodeLink>
                </span>
            )}
        </div>
    )
}
