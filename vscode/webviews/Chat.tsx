import React, { useCallback, useEffect, useRef, useState } from 'react'

import { VSCodeButton, VSCodeLink } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import { ChatContextStatus } from '@sourcegraph/cody-shared/src/chat/context'
import { CodyPrompt } from '@sourcegraph/cody-shared/src/chat/prompts'
import { ChatMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { isDotCom, isLocalApp } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
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

import { CODY_FEEDBACK_URL, OnboardingExperimentArm } from '../src/chat/protocol'

import { ChatCommandsComponent } from './ChatCommands'
import { ChatInputContextSimplified } from './ChatInputContextSimplified'
import { FileLink } from './FileLink'
import { OnboardingPopupProps } from './Popups/OnboardingExperimentPopups'
import { SymbolLink } from './SymbolLink'
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
    chatCommands?: [string, CodyPrompt][]
    isTranscriptError: boolean
    applessOnboarding: {
        arm: OnboardingExperimentArm
        endpoint: string | null
        props: { isAppInstalled: boolean; onboardingPopupProps: OnboardingPopupProps }
    }
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
    chatCommands,
    isTranscriptError,
    applessOnboarding,
}) => {
    const [abortMessageInProgressInternal, setAbortMessageInProgress] = useState<() => void>(() => () => undefined)

    const abortMessageInProgress = useCallback(() => {
        abortMessageInProgressInternal()
        vscodeAPI.postMessage({ command: 'abort' })
        setAbortMessageInProgress(() => () => undefined)
    }, [abortMessageInProgressInternal, vscodeAPI])

    const onSubmit = useCallback(
        (text: string, submitType: 'user' | 'suggestion' | 'example') => {
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
        (text: string, eventType: 'Button' | 'Keydown' = 'Button', command?: string) => {
            const op = 'copy'
            const commandName = command
            // remove the additional /n added by the text area at the end of the text
            const code = eventType === 'Button' ? text.replace(/\n$/, '') : text
            // Log the event type and text to telemetry in chat view
            vscodeAPI.postMessage({ command: op, eventType, text: code, commandName })
        },
        [vscodeAPI]
    )

    const onInsertBtnClick = useCallback(
        (text: string, newFile = false) => {
            const op = newFile ? 'newFile' : 'insert'
            const eventType = 'Button'
            // remove the additional /n added by the text area at the end of the text
            const code = eventType === 'Button' ? text.replace(/\n$/, '') : text
            // Log the event type and text to telemetry in chat view
            vscodeAPI.postMessage({ command: op, eventType, text: code })
        },
        [vscodeAPI]
    )

    const useSimplifiedAppOnboarding =
        applessOnboarding.arm === OnboardingExperimentArm.Simplified &&
        applessOnboarding.endpoint &&
        (isDotCom(applessOnboarding.endpoint) || isLocalApp(applessOnboarding.endpoint))

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
            abortMessageInProgressComponent={AbortMessageInProgress}
            onAbortMessageInProgress={abortMessageInProgress}
            isTranscriptError={isTranscriptError}
            // TODO: We should fetch this from the server and pass a pretty component
            // down here to render cody is disabled on the instance nicely.
            isCodyEnabled={true}
            codyNotEnabledNotice={undefined}
            afterMarkdown={welcomeMessageMarkdown}
            helpMarkdown=""
            ChatButtonComponent={ChatButton}
            chatCommands={chatCommands}
            filterChatCommands={filterChatCommands}
            ChatCommandsComponent={ChatCommandsComponent}
            contextStatusComponent={useSimplifiedAppOnboarding ? ChatInputContextSimplified : undefined}
            contextStatusComponentProps={
                useSimplifiedAppOnboarding
                    ? {
                          contextStatus,
                          ...applessOnboarding.props,
                      }
                    : undefined
            }
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
    setValue,
    required,
    onInput,
    onKeyDown,
}) => {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const placeholder = "Ask a question or type '/' for commands"

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
        (event: React.KeyboardEvent<HTMLElement>): void => {
            onKeyDown?.(event, inputRef.current?.selectionStart ?? null)
        },
        [inputRef, onKeyDown]
    )

    const onTextAreaCommandButtonClick = useCallback((): void => {
        if (setValue && inputRef?.current?.value === '') {
            setValue('/')
            inputRef.current?.focus()
        }
    }, [inputRef, setValue])

    return (
        <div className={classNames(styles.chatInputContainer)} data-value={value || placeholder}>
            <textarea
                className={classNames(styles.chatInput, className)}
                rows={1}
                ref={inputRef}
                value={value}
                required={required}
                onInput={onInput}
                onKeyDown={onTextAreaKeyDown}
                placeholder={placeholder}
                aria-label="Chat message"
                title="" // Set to blank to avoid HTML5 error tooltip "Please fill in this field"
            />
            <div className={styles.chatInputActions}>
                <VSCodeButton
                    appearance="icon"
                    type="button"
                    className={styles.chatInputCommandButton}
                    onClick={onTextAreaCommandButtonClick}
                    disabled={!!value}
                    title="Commands"
                >
                    <i className="codicon codicon-terminal" />
                </VSCodeButton>
            </div>
        </div>
    )
}

const SubmitButton: React.FunctionComponent<ChatUISubmitButtonProps> = ({ className, disabled, onClick }) => (
    <VSCodeButton
        className={classNames(styles.submitButton, className)}
        appearance="icon"
        type="button"
        disabled={disabled}
        onClick={onClick}
        title="Send Message"
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

const welcomeMessageMarkdown = `Start writing code and I’ll autocomplete lines and entire functions for you.

You can ask me to explain, document and edit code using the [Cody Commands](command:cody.action.commands.menu) action (⌥C), or by right-clicking on code and using the “Cody” menu.

See the [Getting Started](command:cody.welcome) guide for more tips and tricks.
`

const slashCommandRegex = /^\/[A-Za-z]+/
function isSlashCommand(value: string): boolean {
    return slashCommandRegex.test(value)
}

function normalize(input: string): string {
    return input.trim().toLowerCase()
}

function filterChatCommands(chatCommands: [string, CodyPrompt][], query: string): [string, CodyPrompt][] {
    const normalizedQuery = normalize(query)

    if (!isSlashCommand(normalizedQuery)) {
        return []
    }

    const [slashCommand] = normalizedQuery.split(' ')
    const matchingCommands: [string, CodyPrompt][] = chatCommands.filter(
        ([key, command]) => key === 'separator' || command.slashCommand?.toLowerCase().startsWith(slashCommand)
    )
    return matchingCommands
}
