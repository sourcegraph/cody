import React, { useCallback, useEffect, useRef, useState } from 'react'

import { VSCodeButton, VSCodeLink } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import {
    type ChatMessage,
    type ChatModelProvider,
    type CodyCommand,
    type ContextFile,
    type Guardrails,
    type TelemetryService,
} from '@sourcegraph/cody-shared'
import {
    Chat as ChatUI,
    type ChatButtonProps,
    type ChatSubmitType,
    type ChatUISubmitButtonProps,
    type ChatUISuggestionButtonProps,
    type ChatUITextAreaProps,
    type EditButtonProps,
    type FeedbackButtonsProps,
    type UserAccountInfo,
} from '@sourcegraph/cody-ui/src/Chat'
import { type CodeBlockMeta } from '@sourcegraph/cody-ui/src/chat/CodeBlocks'

import { CODY_FEEDBACK_URL } from '../src/chat/protocol'

import { ChatCommandsComponent } from './ChatCommands'
import { ChatModelDropdownMenu } from './Components/ChatModelDropdownMenu'
import { EnhancedContextSettings, useEnhancedContextEnabled } from './Components/EnhancedContextSettings'
import { FileLink } from './Components/FileLink'
import { SymbolLink } from './SymbolLink'
import { UserContextSelectorComponent } from './UserContextSelector'
import { type VSCodeWrapper } from './utils/VSCodeApi'

import styles from './Chat.module.css'

interface ChatboxProps {
    welcomeMessage?: string
    chatEnabled: boolean
    messageInProgress: ChatMessage | null
    messageBeingEdited: boolean
    setMessageBeingEdited: (input: boolean) => void
    transcript: ChatMessage[]
    formInput: string
    setFormInput: (input: string) => void
    inputHistory: string[]
    setInputHistory: (history: string[]) => void
    vscodeAPI: VSCodeWrapper
    telemetryService: TelemetryService
    suggestions?: string[]
    setSuggestions?: (suggestions: undefined | string[]) => void
    chatCommands?: [string, CodyCommand][]
    isTranscriptError: boolean
    contextSelection?: ContextFile[] | null
    setChatModels?: (models: ChatModelProvider[]) => void
    chatModels?: ChatModelProvider[]
    enableNewChatUI: boolean
    userInfo: UserAccountInfo
    guardrails?: Guardrails
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
    suggestions,
    setSuggestions,
    chatCommands,
    isTranscriptError,
    contextSelection,
    setChatModels,
    chatModels,
    enableNewChatUI,
    chatEnabled,
    userInfo,
    guardrails,
}) => {
    const abortMessageInProgress = useCallback(() => {
        vscodeAPI.postMessage({ command: 'abort' })
    }, [vscodeAPI])

    const addEnhancedContext = useEnhancedContextEnabled()

    const onSubmit = useCallback(
        (text: string, submitType: ChatSubmitType, contextFiles?: Map<string, ContextFile>) => {
            const userContextFiles: ContextFile[] = []

            // loop the addedcontextfiles and check if the key still exists in the text, remove the ones not present
            if (contextFiles?.size) {
                for (const [fileName, contextFile] of contextFiles) {
                    if (text.includes(fileName)) {
                        userContextFiles.push(contextFile)
                    }
                }
            }

            vscodeAPI.postMessage({
                command: 'submit',
                text,
                submitType,
                addEnhancedContext,
                contextFiles: userContextFiles,
            })
        },
        [vscodeAPI, addEnhancedContext]
    )

    const onCurrentChatModelChange = useCallback(
        (selected: ChatModelProvider): void => {
            if (!chatModels || !setChatModels) {
                return
            }
            vscodeAPI.postMessage({ command: 'chatModel', model: selected.model })
            const updatedChatModels = chatModels.map(m =>
                m.model === selected.model ? { ...m, default: true } : { ...m, default: false }
            )
            setChatModels(updatedChatModels)
        },
        [chatModels, setChatModels, vscodeAPI]
    )

    const onEditBtnClick = useCallback(
        (text: string, index?: number) => {
            vscodeAPI.postMessage({ command: 'edit', text, index, addEnhancedContext })
        },
        [addEnhancedContext, vscodeAPI]
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
            vscodeAPI.postMessage({ command: op, eventType, text: code, metadata })
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
            vscodeAPI.postMessage({ command: op, eventType, text: code, metadata })
        },
        [vscodeAPI]
    )

    return (
        <ChatUI
            messageInProgress={messageInProgress}
            messageBeingEdited={messageBeingEdited}
            setMessageBeingEdited={setMessageBeingEdited}
            transcript={transcript}
            formInput={formInput}
            setFormInput={setFormInput}
            inputHistory={inputHistory}
            setInputHistory={setInputHistory}
            onSubmit={onSubmit}
            textAreaComponent={TextArea}
            submitButtonComponent={SubmitButton}
            suggestionButtonComponent={SuggestionButton}
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
            chatInputContextClassName={styles.chatInputContext}
            chatInputClassName={styles.chatInputClassName}
            EditButtonContainer={EditButton}
            editButtonOnSubmit={onEditBtnClick}
            FeedbackButtonsContainer={FeedbackButtons}
            feedbackButtonsOnSubmit={onFeedbackBtnClick}
            copyButtonOnSubmit={onCopyBtnClick}
            insertButtonOnSubmit={onInsertBtnClick}
            suggestions={suggestions}
            setSuggestions={setSuggestions}
            onAbortMessageInProgress={abortMessageInProgress}
            isTranscriptError={isTranscriptError}
            // TODO: We should fetch this from the server and pass a pretty component
            // down here to render cody is disabled on the instance nicely.
            isCodyEnabled={true}
            codyNotEnabledNotice={undefined}
            afterMarkdown={welcomeMessage}
            helpMarkdown=""
            ChatButtonComponent={ChatButton}
            chatCommands={chatCommands}
            filterChatCommands={filterChatCommands}
            ChatCommandsComponent={ChatCommandsComponent}
            contextSelection={contextSelection}
            UserContextSelectorComponent={UserContextSelectorComponent}
            chatModels={chatModels}
            onCurrentChatModelChange={onCurrentChatModelChange}
            ChatModelDropdownMenu={ChatModelDropdownMenu}
            userInfo={userInfo}
            chatEnabled={chatEnabled}
            EnhancedContextSettings={enableNewChatUI ? EnhancedContextSettings : undefined}
            isEnhancedContextEnabled={addEnhancedContext}
            postMessage={msg => vscodeAPI.postMessage(msg)}
            guardrails={guardrails}
        />
    )
}

const ChatButton: React.FunctionComponent<ChatButtonProps> = ({ label, action, onClick, appearance }) => (
    <VSCodeButton type="button" onClick={() => onClick(action)} className={styles.chatButton} appearance={appearance}>
        {label}
    </VSCodeButton>
)

const TextArea: React.FunctionComponent<ChatUITextAreaProps> = ({
    type,
    className,
    rows,
    autoFocus,
    value,
    setValue,
    chatEnabled,
    required,
    onInput,
    onKeyDown,
    onKeyUp,
    onFocus,
    chatModels,
}) => {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const defaultPlaceholder = 'Message (@ to include code, / for commands)'
    const editPlaceholder = 'Edit message'
    const placeholder = type === 'edit' ? editPlaceholder : defaultPlaceholder
    const disabledPlaceHolder = 'Chat has been disabled by your Enterprise instance site administrator'

    useEffect(() => {
        if (autoFocus) {
            inputRef.current?.focus()
        }
    }, [autoFocus, value, rows])

    // Focus the textarea when the webview gains focus (unless there is text selected). This makes
    // it so that the user can immediately start typing to Cody after invoking `Cody: Focus on Chat
    // View` with the keyboard.
    useEffect(() => {
        const handleFocus = (): void => {
            if (document.getSelection()?.isCollapsed) {
                inputRef.current?.focus()
            }
        }
        window.addEventListener('focus', handleFocus)
        return () => {
            window.removeEventListener('focus', handleFocus)
        }
    }, [])

    const onTextAreaKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
            onKeyDown?.(event, inputRef.current?.selectionStart ?? null)
        },
        [inputRef, onKeyDown]
    )

    const onTextAreaFocus = useCallback(
        (event: React.FocusEvent<HTMLTextAreaElement>): void => {
            // move cursor to end of line
            const length = event.target.value.length
            event.target.setSelectionRange(length, length)
            onFocus?.(event)
        },
        [onFocus]
    )

    const onTextAreaKeyUp = useCallback(
        (event: React.KeyboardEvent<HTMLElement>): void => {
            onKeyUp?.(event, inputRef.current?.selectionStart ?? null)
        },
        [inputRef, onKeyUp]
    )

    const actualPlaceholder = chatEnabled ? placeholder : disabledPlaceHolder
    const isDisabled = !chatEnabled

    return (
        <div
            className={classNames(styles.chatInputContainer, className, chatModels && styles.newChatInputContainer)}
            data-value={value || actualPlaceholder}
        >
            <textarea
                className={classNames(
                    styles.chatInput,
                    chatModels && styles.newChatInput,
                    isDisabled && styles.textareaDisabled
                )}
                rows={1}
                ref={inputRef}
                value={value}
                required={required}
                onInput={onInput}
                onKeyDown={onTextAreaKeyDown}
                onFocus={onTextAreaFocus}
                onKeyUp={onTextAreaKeyUp}
                placeholder={actualPlaceholder}
                aria-label="Chat message"
                title="" // Set to blank to avoid HTML5 error tooltip "Please fill in this field"
                disabled={isDisabled} // Disable the textarea if the chat is disabled and change the background color to grey
            />
        </div>
    )
}

const SubmitButton: React.FunctionComponent<ChatUISubmitButtonProps> = ({
    className,
    disabled,
    onClick,
    onAbortMessageInProgress,
    type,
}) => (
    <VSCodeButton
        className={classNames(styles.submitButton, className, disabled && styles.submitButtonDisabled)}
        type="button"
        disabled={disabled}
        onClick={onAbortMessageInProgress ?? onClick}
        title={
            onAbortMessageInProgress
                ? 'Stop Generating'
                : type === 'edit'
                ? 'Update Message'
                : type === 'follow-up'
                ? 'Send Message'
                : 'Start New Chat'
        }
    >
        {type === 'edit' ? (
            <i className="codicon codicon-check" />
        ) : onAbortMessageInProgress ? (
            <i className="codicon codicon-debug-stop" />
        ) : type === 'follow-up' ? (
            <i className="codicon codicon-arrow-up" />
        ) : (
            <i className="codicon codicon-add" />
        )}
    </VSCodeButton>
)

const SuggestionButton: React.FunctionComponent<ChatUISuggestionButtonProps> = ({ suggestion, onClick }) => (
    <button className={styles.suggestionButton} type="button" onClick={onClick}>
        {suggestion}
    </button>
)

// This turns into a cancel button when message is being edited
const EditButton: React.FunctionComponent<EditButtonProps> = ({
    className,
    messageBeingEdited,
    setMessageBeingEdited,
}) => (
    <VSCodeButton
        className={classNames(messageBeingEdited ? styles.editButtonDisabled : styles.editButton, className)}
        appearance="icon"
        title={messageBeingEdited ? 'cancel edit' : 'edit your message'}
        type="button"
        onClick={() => setMessageBeingEdited(!messageBeingEdited)}
    >
        <i className={messageBeingEdited ? 'codicon codicon-close' : 'codicon codicon-edit'} />
    </VSCodeButton>
)

const FeedbackButtons: React.FunctionComponent<FeedbackButtonsProps> = ({ className, feedbackButtonsOnSubmit }) => {
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

const slashCommandRegex = /^\/[A-Za-z]+/
function isSlashCommand(value: string): boolean {
    return slashCommandRegex.test(value)
}

function normalize(input: string): string {
    return input.trim().toLowerCase()
}

function filterChatCommands(chatCommands: [string, CodyCommand][], query: string): [string, CodyCommand][] {
    const normalizedQuery = normalize(query)

    if (!isSlashCommand(normalizedQuery)) {
        return []
    }

    const [slashCommand] = normalizedQuery.split(' ')
    const matchingCommands: [string, CodyCommand][] = chatCommands.filter(
        ([key, command]) => key === 'separator' || command.slashCommand?.toLowerCase().startsWith(slashCommand)
    )
    return matchingCommands.sort()
}
