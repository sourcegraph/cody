import React, { useCallback, useMemo, useState } from 'react'

import classNames from 'classnames'

import { ChatButton, ChatContextStatus, ChatMessage, CodyPrompt, isDefined } from '@sourcegraph/cody-shared'

import { FileLinkProps } from './chat/ContextFiles'
import { ChatInputContext } from './chat/inputContext/ChatInputContext'
import { Transcript } from './chat/Transcript'
import { TranscriptItemClassNames } from './chat/TranscriptItem'

import styles from './Chat.module.css'

interface ChatProps extends ChatClassNames {
    transcript: ChatMessage[]
    messageInProgress: ChatMessage | null
    messageBeingEdited: boolean
    setMessageBeingEdited: (input: boolean) => void
    contextStatus?: ChatContextStatus | null
    formInput: string
    setFormInput: (input: string) => void
    inputHistory: string[]
    setInputHistory: (history: string[]) => void
    onSubmit: (text: string, submitType: 'user' | 'suggestion') => void
    contextStatusComponent?: React.FunctionComponent<any>
    contextStatusComponentProps?: any
    textAreaComponent: React.FunctionComponent<ChatUITextAreaProps>
    submitButtonComponent: React.FunctionComponent<ChatUISubmitButtonProps>
    suggestionButtonComponent?: React.FunctionComponent<ChatUISuggestionButtonProps>
    fileLinkComponent: React.FunctionComponent<FileLinkProps>
    helpMarkdown?: string
    afterMarkdown?: string
    gettingStartedButtons?: ChatButton[]
    className?: string
    EditButtonContainer?: React.FunctionComponent<EditButtonProps>
    editButtonOnSubmit?: (text: string) => void
    FeedbackButtonsContainer?: React.FunctionComponent<FeedbackButtonsProps>
    feedbackButtonsOnSubmit?: (text: string) => void
    copyButtonOnSubmit?: CopyButtonProps['copyButtonOnSubmit']
    suggestions?: string[]
    setSuggestions?: (suggestions: undefined | []) => void
    needsEmailVerification?: boolean
    needsEmailVerificationNotice?: React.FunctionComponent
    codyNotEnabledNotice?: React.FunctionComponent
    abortMessageInProgressComponent?: React.FunctionComponent<{ onAbortMessageInProgress: () => void }>
    onAbortMessageInProgress?: () => void
    isCodyEnabled: boolean
    ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
    pluginsDevMode?: boolean
    chatCommands?: [string, CodyPrompt][] | null
    ChatCommandsComponent?: React.FunctionComponent<ChatCommandsProps>
}

interface ChatClassNames extends TranscriptItemClassNames {
    inputRowClassName?: string
    chatInputContextClassName?: string
    chatInputClassName?: string
}

export interface ChatButtonProps {
    label: string
    action: string
    onClick: (action: string) => void
}

export interface ChatUITextAreaProps {
    className: string
    rows: number
    autoFocus: boolean
    value: string
    required: boolean
    disabled?: boolean
    onInput: React.FormEventHandler<HTMLElement>
    onKeyDown?: (event: React.KeyboardEvent<HTMLElement>, caretPosition: number | null) => void
}

export interface ChatUISubmitButtonProps {
    className: string
    disabled: boolean
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
}

export interface ChatUISuggestionButtonProps {
    suggestion: string
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
}

export interface EditButtonProps {
    className: string
    disabled?: boolean
    messageBeingEdited: boolean
    setMessageBeingEdited: (input: boolean) => void
}

export interface FeedbackButtonsProps {
    className: string
    disabled?: boolean
    feedbackButtonsOnSubmit: (text: string) => void
}

// TODO: Rename to CodeBlockActionsProps
export interface CopyButtonProps {
    copyButtonOnSubmit: (text: string, insert?: boolean) => void
}

export interface ChatCommandsProps {
    formInput: string
    chatCommands?: [string, CodyPrompt][] | null
    selectedChatCommand?: number
}
/**
 * The Cody chat interface, with a transcript of all messages and a message form.
 */
export const Chat: React.FunctionComponent<ChatProps> = ({
    messageInProgress,
    messageBeingEdited,
    setMessageBeingEdited,
    transcript,
    contextStatus,
    formInput,
    setFormInput,
    inputHistory,
    setInputHistory,
    onSubmit,
    textAreaComponent: TextArea,
    submitButtonComponent: SubmitButton,
    suggestionButtonComponent: SuggestionButton,
    fileLinkComponent,
    helpMarkdown,
    afterMarkdown,
    gettingStartedButtons,
    className,
    codeBlocksCopyButtonClassName,
    codeBlocksInsertButtonClassName,
    transcriptItemClassName,
    humanTranscriptItemClassName,
    transcriptItemParticipantClassName,
    transcriptActionClassName,
    inputRowClassName,
    chatInputContextClassName,
    chatInputClassName,
    EditButtonContainer,
    editButtonOnSubmit,
    FeedbackButtonsContainer,
    feedbackButtonsOnSubmit,
    copyButtonOnSubmit,
    suggestions,
    setSuggestions,
    needsEmailVerification = false,
    codyNotEnabledNotice: CodyNotEnabledNotice,
    needsEmailVerificationNotice: NeedsEmailVerificationNotice,
    contextStatusComponent: ContextStatusComponent,
    contextStatusComponentProps = {},
    abortMessageInProgressComponent: AbortMessageInProgressButton,
    onAbortMessageInProgress = () => {},
    isCodyEnabled,
    ChatButtonComponent,
    pluginsDevMode,
    chatCommands,
    ChatCommandsComponent,
}) => {
    const [inputRows, setInputRows] = useState(5)
    const commandList = chatCommands?.filter(command => command[1]?.slashCommand) || null
    const [displayCommands, setDisplayCommands] = useState<[string, CodyPrompt][] | null>(commandList || null)
    const [selectedChatCommand, setSelectedChatCommand] = useState(-1)
    const [historyIndex, setHistoryIndex] = useState(inputHistory.length)

    // Handles selecting a chat command when the user types a slash in the chat input.
    const chatCommentSelectionHandler = useCallback(
        (inputValue: string): void => {
            if (!commandList || !ChatCommandsComponent) {
                return
            }
            if (inputValue === '/') {
                setDisplayCommands(commandList)
                setSelectedChatCommand(0)
                return
            }
            if (inputValue.startsWith('/')) {
                const command = inputValue.replace('/', '')
                const filteredCommands = commandList.filter(([_, prompt]) => prompt.slashCommand?.startsWith(command))
                setDisplayCommands(filteredCommands)
                setSelectedChatCommand(0)
                return
            }
            setDisplayCommands(null)
            setSelectedChatCommand(-1)
        },
        [ChatCommandsComponent, commandList]
    )

    const inputHandler = useCallback(
        (inputValue: string): void => {
            chatCommentSelectionHandler(inputValue)
            const rowsCount = inputValue.match(/\n/g)?.length
            if (rowsCount) {
                setInputRows(rowsCount < 5 ? 5 : rowsCount > 25 ? 25 : rowsCount)
            } else {
                setInputRows(5)
            }
            setFormInput(inputValue)
            if (inputValue !== inputHistory[historyIndex]) {
                setHistoryIndex(inputHistory.length)
            }
        },
        [chatCommentSelectionHandler, historyIndex, inputHistory, setFormInput]
    )

    const submitInput = useCallback(
        (input: string, submitType: 'user' | 'suggestion'): void => {
            if (messageInProgress) {
                return
            }

            onSubmit(input, submitType)
            setSuggestions?.(undefined)
            setHistoryIndex(inputHistory.length + 1)
            setInputHistory([...inputHistory, input])
        },
        [inputHistory, messageInProgress, onSubmit, setInputHistory, setSuggestions]
    )
    const onChatInput = useCallback(
        ({ target }: React.SyntheticEvent) => {
            const { value } = target as HTMLInputElement
            inputHandler(value)
        },
        [inputHandler]
    )

    const onChatSubmit = useCallback((): void => {
        // Submit chat only when input is not empty and not in progress
        if (formInput.trim() && !messageInProgress) {
            setInputRows(5)
            setFormInput('')
            submitInput(formInput, 'user')
        }
    }, [formInput, messageInProgress, setFormInput, submitInput])

    const onChatKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLElement>, caretPosition: number | null): void => {
            // Submit input on Enter press (without shift) and
            // trim the formInput to make sure input value is not empty.
            if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                formInput &&
                formInput.trim()
            ) {
                event.preventDefault()
                event.stopPropagation()
                setMessageBeingEdited(false)
                onChatSubmit()
            }

            // Handles cycling through chat command suggestions using the up and down arrow keys
            if (displayCommands && formInput.startsWith('/')) {
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    const commandsLength = displayCommands?.length - 1
                    const newIndex = event.key === 'ArrowUp' ? selectedChatCommand + 1 : selectedChatCommand - 1
                    const newCommandIndex = newIndex < 0 ? 0 : newIndex > commandsLength ? 0 : newIndex
                    setSelectedChatCommand(newCommandIndex)
                    const newInput = displayCommands?.[newCommandIndex]?.[1]?.slashCommand
                    setFormInput(`/${newInput}`)
                }
            }

            // Loop through input history on up arrow press
            if (!inputHistory.length) {
                return
            }

            // Clear & reset session on CMD+K
            if (event.metaKey && event.key === 'k') {
                onSubmit('/r', 'user')
            }

            if (formInput === inputHistory[historyIndex] || !formInput) {
                if (event.key === 'ArrowUp' && caretPosition === 0) {
                    const newIndex = historyIndex - 1 < 0 ? inputHistory.length - 1 : historyIndex - 1
                    setHistoryIndex(newIndex)
                    setFormInput(inputHistory[newIndex])
                } else if (event.key === 'ArrowDown' && caretPosition === formInput.length) {
                    if (historyIndex + 1 < inputHistory.length) {
                        const newIndex = historyIndex + 1
                        setHistoryIndex(newIndex)
                        setFormInput(inputHistory[newIndex])
                    }
                }
            }
        },
        [
            formInput,
            selectedChatCommand,
            displayCommands,
            inputHistory,
            historyIndex,
            setMessageBeingEdited,
            onChatSubmit,
            setFormInput,
            onSubmit,
        ]
    )

    const transcriptWithWelcome = useMemo<ChatMessage[]>(
        () => [
            {
                speaker: 'assistant',
                displayText: welcomeText({ helpMarkdown, afterMarkdown }),
                buttons: gettingStartedButtons,
            },
            ...transcript,
        ],
        [helpMarkdown, afterMarkdown, gettingStartedButtons, transcript]
    )

    return (
        <div className={classNames(className, styles.innerContainer)}>
            {!isCodyEnabled && CodyNotEnabledNotice ? (
                <div className="flex-1">
                    <CodyNotEnabledNotice />
                </div>
            ) : needsEmailVerification && NeedsEmailVerificationNotice ? (
                <div className="flex-1">
                    <NeedsEmailVerificationNotice />
                </div>
            ) : (
                <Transcript
                    transcript={transcriptWithWelcome}
                    messageInProgress={messageInProgress}
                    messageBeingEdited={messageBeingEdited}
                    setMessageBeingEdited={setMessageBeingEdited}
                    fileLinkComponent={fileLinkComponent}
                    codeBlocksCopyButtonClassName={codeBlocksCopyButtonClassName}
                    codeBlocksInsertButtonClassName={codeBlocksInsertButtonClassName}
                    transcriptItemClassName={transcriptItemClassName}
                    humanTranscriptItemClassName={humanTranscriptItemClassName}
                    transcriptItemParticipantClassName={transcriptItemParticipantClassName}
                    transcriptActionClassName={transcriptActionClassName}
                    className={styles.transcriptContainer}
                    textAreaComponent={TextArea}
                    EditButtonContainer={EditButtonContainer}
                    editButtonOnSubmit={editButtonOnSubmit}
                    FeedbackButtonsContainer={FeedbackButtonsContainer}
                    feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                    copyButtonOnSubmit={copyButtonOnSubmit}
                    submitButtonComponent={SubmitButton}
                    chatInputClassName={chatInputClassName}
                    ChatButtonComponent={ChatButtonComponent}
                    pluginsDevMode={pluginsDevMode}
                />
            )}

            <form className={classNames(styles.inputRow, inputRowClassName)}>
                {suggestions !== undefined && suggestions.length !== 0 && SuggestionButton ? (
                    <div className={styles.suggestions}>
                        {suggestions.map((suggestion: string) =>
                            suggestion.trim().length > 0 ? (
                                <SuggestionButton
                                    key={suggestion}
                                    suggestion={suggestion}
                                    onClick={() => submitInput(suggestion, 'suggestion')}
                                />
                            ) : null
                        )}
                    </div>
                ) : null}
                {displayCommands && ChatCommandsComponent && formInput && (
                    <ChatCommandsComponent
                        chatCommands={displayCommands}
                        selectedChatCommand={selectedChatCommand}
                        formInput={formInput}
                    />
                )}
                {messageInProgress && AbortMessageInProgressButton && (
                    <div className={classNames(styles.abortButtonContainer)}>
                        <AbortMessageInProgressButton onAbortMessageInProgress={onAbortMessageInProgress} />
                    </div>
                )}
                <div className={styles.textAreaContainer}>
                    <TextArea
                        className={classNames(styles.chatInput, chatInputClassName)}
                        rows={inputRows}
                        value={isCodyEnabled ? formInput : 'Cody is disabled on this instance'}
                        autoFocus={true}
                        required={true}
                        disabled={needsEmailVerification || !isCodyEnabled}
                        onInput={onChatInput}
                        onKeyDown={onChatKeyDown}
                    />
                    <SubmitButton
                        className={styles.submitButton}
                        onClick={onChatSubmit}
                        disabled={!!messageInProgress || needsEmailVerification || !isCodyEnabled}
                    />
                </div>
                {ContextStatusComponent ? (
                    <ContextStatusComponent {...contextStatusComponentProps} />
                ) : (
                    contextStatus && (
                        <ChatInputContext contextStatus={contextStatus} className={chatInputContextClassName} />
                    )
                )}
            </form>
        </div>
    )
}

interface WelcomeTextOptions {
    /** Provide users with a way to quickly access Cody docs/help.*/
    helpMarkdown?: string
    /** Provide additional content to supplement the original message. Example: tips, privacy policy. */
    afterMarkdown?: string
}

function welcomeText({
    helpMarkdown = 'See [Cody documentation](https://docs.sourcegraph.com/cody) for help and tips.',
    afterMarkdown,
}: WelcomeTextOptions): string {
    return ["Hello! I'm Cody. I can write code and answer questions for you. " + helpMarkdown, afterMarkdown]
        .filter(isDefined)
        .join('\n\n')
}
