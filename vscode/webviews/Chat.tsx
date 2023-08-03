import React, { useCallback, useEffect, useRef, useState } from 'react'

import { VSCodeButton, VSCodeLink, VSCodeTextArea } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import { ChatContextStatus } from '@sourcegraph/cody-shared/src/chat/context'
import { CodyPrompt } from '@sourcegraph/cody-shared/src/chat/prompts'
import { ChatMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'
import {
    ChatButtonProps,
    Chat as ChatUI,
    ChatUISubmitButtonProps,
    ChatUISuggestionButtonProps,
    ChatUITextAreaProps,
    EditButtonProps,
    FeedbackButtonsProps,
} from '@sourcegraph/cody-ui/src/Chat'
import { SubmitSvg } from '@sourcegraph/cody-ui/src/utils/icons'

import { CODY_FEEDBACK_URL } from '../src/chat/protocol'

import { ChatCommandsComponent } from './ChatCommands'
import { FileLink } from './FileLink'
import { VSCodeWrapper } from './utils/VSCodeApi'

import styles from './Chat.module.css'

interface ChatboxProps {
    messageInProgress: ChatMessage | null
    messageBeingEdited: boolean
    setMessageBeingEdited: (input: boolean) => void
    transcript: ChatMessage[]
    contextStatus: ChatContextStatus | null
    formInput: string
    setFormInput: (input: string) => void
    inputHistory: string[]
    setInputHistory: (history: string[]) => void
    vscodeAPI: VSCodeWrapper
    telemetryService: TelemetryService
    suggestions?: string[]
    setSuggestions?: (suggestions: undefined | string[]) => void
    pluginsDevMode?: boolean
    chatCommands?: [string, CodyPrompt][]
    isTranscriptError: boolean
    showOnboardingButtons?: boolean | null
}

export const Chat: React.FunctionComponent<React.PropsWithChildren<ChatboxProps>> = ({
    messageInProgress,
    messageBeingEdited,
    setMessageBeingEdited,
    transcript,
    contextStatus,
    formInput,
    setFormInput,
    inputHistory,
    setInputHistory,
    vscodeAPI,
    telemetryService,
    suggestions,
    setSuggestions,
    pluginsDevMode,
    chatCommands,
    isTranscriptError,
    showOnboardingButtons,
}) => {
    const [abortMessageInProgressInternal, setAbortMessageInProgress] = useState<() => void>(() => () => undefined)

    const abortMessageInProgress = useCallback(() => {
        abortMessageInProgressInternal()
        vscodeAPI.postMessage({ command: 'abort' })
        setAbortMessageInProgress(() => () => undefined)
    }, [abortMessageInProgressInternal, vscodeAPI])

    const onSubmit = useCallback(
        (text: string, submitType: 'user' | 'suggestion') => {
            vscodeAPI.postMessage({ command: 'submit', text, submitType })
        },
        [vscodeAPI]
    )

    const onEditBtnClick = useCallback(
        (text: string) => {
            vscodeAPI.postMessage({ command: 'edit', text })
        },
        [vscodeAPI]
    )

    const onFeedbackBtnClick = useCallback(
        (text: string) => {
            telemetryService.log(`CodyVSCodeExtension:codyFeedback:${text}`, {
                value: text,
                lastChatUsedEmbeddings: Boolean(
                    transcript.at(-1)?.contextFiles?.some(file => file.source === 'embeddings')
                ),
            })
        },
        [telemetryService, transcript]
    )

    const onCopyBtnClick = useCallback(
        (text: string, isInsert = false) => {
            if (isInsert) {
                vscodeAPI.postMessage({ command: 'insert', text })
            }
            const op = isInsert ? 'insert' : 'copy'
            telemetryService.log(`CodyVSCodeExtension:${op}Button:clicked`, {
                op,
                textLength: text.length,
            })
        },
        [telemetryService, vscodeAPI]
    )

    return (
        <ChatUI
            messageInProgress={messageInProgress}
            messageBeingEdited={messageBeingEdited}
            setMessageBeingEdited={setMessageBeingEdited}
            transcript={transcript}
            contextStatus={contextStatus}
            formInput={formInput}
            setFormInput={setFormInput}
            inputHistory={inputHistory}
            setInputHistory={setInputHistory}
            onSubmit={onSubmit}
            textAreaComponent={TextArea}
            submitButtonComponent={SubmitButton}
            suggestionButtonComponent={SuggestionButton}
            fileLinkComponent={FileLink}
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
            suggestions={suggestions}
            setSuggestions={setSuggestions}
            abortMessageInProgressComponent={AbortMessageInProgress}
            onAbortMessageInProgress={abortMessageInProgress}
            isTranscriptError={isTranscriptError}
            // TODO: We should fetch this from the server and pass a pretty component
            // down here to render cody is disabled on the instance nicely.
            isCodyEnabled={true}
            codyNotEnabledNotice={undefined}
            afterMarkdown={
                showOnboardingButtons
                    ? 'To get started, select some code and right click to select a Cody command to run.'
                    : ''
            }
            helpMarkdown="See [Getting Started](command:cody.welcome) for help and tips."
            ChatButtonComponent={ChatButton}
            pluginsDevMode={pluginsDevMode}
            chatCommands={chatCommands}
            ChatCommandsComponent={ChatCommandsComponent}
        />
    )
}

interface AbortMessageInProgressProps {
    onAbortMessageInProgress: () => void
}

const AbortMessageInProgress: React.FunctionComponent<AbortMessageInProgressProps> = ({ onAbortMessageInProgress }) => (
    <div className={classNames(styles.stopGeneratingButtonContainer)}>
        <VSCodeButton
            className={classNames(styles.stopGeneratingButton)}
            onClick={onAbortMessageInProgress}
            appearance="secondary"
        >
            <i className="codicon codicon-stop-circle" /> Stop generating
        </VSCodeButton>
    </div>
)

const ChatButton: React.FunctionComponent<ChatButtonProps> = ({ label, action, onClick }) => (
    <VSCodeButton type="button" onClick={() => onClick(action)} className={styles.chatButton}>
        {label}
    </VSCodeButton>
)

const TextArea: React.FunctionComponent<ChatUITextAreaProps> = ({
    className,
    autoFocus,
    value,
    required,
    onInput,
    onKeyDown,
    rows,
}) => {
    // Focus the textarea when the webview gains focus (unless there is text selected). This makes
    // it so that the user can immediately start typing to Cody after invoking `Cody: Focus on Chat
    // View` with the keyboard.
    const inputRef = useRef<HTMLTextAreaElement>(null)
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

    // <VSCodeTextArea autofocus> does not work, so implement autofocus ourselves.
    useEffect(() => {
        if (autoFocus) {
            inputRef.current?.focus()
        }
    }, [autoFocus])

    const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
        if (onKeyDown) {
            onKeyDown(event, (inputRef.current as any)?.control.selectionStart)
        }
    }

    return (
        <VSCodeTextArea
            className={classNames(styles.chatInput, className)}
            rows={rows}
            ref={
                // VSCodeTextArea has a very complex type.
                //
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                inputRef as any
            }
            value={value}
            autofocus={autoFocus}
            required={required}
            onInput={e => onInput(e as React.FormEvent<HTMLTextAreaElement>)}
            placeholder="Ask a question or type '/' for commands"
            onKeyDown={handleKeyDown}
            title="" // Set to blank to avoid HTML5 error tooltip "Please fill in this field"
        />
    )
}

const SubmitButton: React.FunctionComponent<ChatUISubmitButtonProps> = ({ className, disabled, onClick }) => (
    <VSCodeButton
        className={classNames(disabled ? styles.submitButtonDisabled : styles.submitButton, className)}
        appearance="icon"
        type="button"
        disabled={disabled}
        onClick={onClick}
    >
        <SubmitSvg />
    </VSCodeButton>
)

const SuggestionButton: React.FunctionComponent<ChatUISuggestionButtonProps> = ({ suggestion, onClick }) => (
    <button className={styles.suggestionButton} type="button" onClick={onClick}>
        {suggestion}
    </button>
)

const EditButton: React.FunctionComponent<EditButtonProps> = ({
    className,
    messageBeingEdited,
    setMessageBeingEdited,
}) => (
    <div className={className}>
        <VSCodeButton
            className={classNames(styles.editButton)}
            appearance="icon"
            type="button"
            onClick={() => setMessageBeingEdited(!messageBeingEdited)}
        >
            <i className={messageBeingEdited ? 'codicon codicon-close' : 'codicon codicon-edit'} />
        </VSCodeButton>
    </div>
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
