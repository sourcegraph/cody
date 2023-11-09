import React, { useCallback, useMemo, useState } from 'react'

import classNames from 'classnames'

import {
    ChatButton,
    ChatContextStatus,
    ChatMessage,
    CodyPrompt,
    ContextFile,
    isDefined,
} from '@sourcegraph/cody-shared'

import { CodeBlockMeta } from './chat/CodeBlocks'
import { FileLinkProps } from './chat/ContextFiles'
import { ChatInputContext } from './chat/inputContext/ChatInputContext'
import { SymbolLinkProps } from './chat/PreciseContext'
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
    onSubmit: (text: string, submitType: ChatSubmitType, contextConfig?: ChatContextConfig) => void
    contextStatusComponent?: React.FunctionComponent<any>
    contextStatusComponentProps?: any
    gettingStartedComponent?: React.FunctionComponent<any>
    gettingStartedComponentProps?: any
    textAreaComponent: React.FunctionComponent<ChatUITextAreaProps>
    submitButtonComponent: React.FunctionComponent<ChatUISubmitButtonProps>
    suggestionButtonComponent?: React.FunctionComponent<ChatUISuggestionButtonProps>
    fileLinkComponent: React.FunctionComponent<FileLinkProps>
    symbolLinkComponent: React.FunctionComponent<SymbolLinkProps>
    helpMarkdown?: string
    afterMarkdown?: string
    gettingStartedButtons?: ChatButton[]
    className?: string
    EditButtonContainer?: React.FunctionComponent<EditButtonProps>
    editButtonOnSubmit?: (text: string) => void
    FeedbackButtonsContainer?: React.FunctionComponent<FeedbackButtonsProps>
    feedbackButtonsOnSubmit?: (text: string) => void
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
    suggestions?: string[]
    setSuggestions?: (suggestions: undefined | []) => void
    needsEmailVerification?: boolean
    needsEmailVerificationNotice?: React.FunctionComponent
    codyNotEnabledNotice?: React.FunctionComponent
    abortMessageInProgressComponent?: React.FunctionComponent<{ onAbortMessageInProgress: () => void }>
    onAbortMessageInProgress?: () => void
    isCodyEnabled: boolean
    ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
    chatCommands?: [string, CodyPrompt][] | null
    filterChatCommands?: (chatCommands: [string, CodyPrompt][], input: string) => [string, CodyPrompt][]
    ChatCommandsComponent?: React.FunctionComponent<ChatCommandsProps>
    isTranscriptError?: boolean
    contextSelection?: ContextFile[]
    UserContextSelectorComponent?: React.FunctionComponent<UserContextSelectorProps>
    chatModels?: ChatModelSelection[]
    ChatModelDropdownMenu?: React.FunctionComponent<{ models: ChatModelSelection[]; disabled: boolean }>
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
    setValue?: (value: string) => void
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

export interface CodeBlockActionsProps {
    copyButtonOnSubmit: (text: string, event?: 'Keydown' | 'Button', metadata?: CodeBlockMeta) => void
    insertButtonOnSubmit: (text: string, newFile?: boolean, metadata?: CodeBlockMeta) => void
}

export interface ChatCommandsProps {
    setFormInput: (input: string) => void
    setSelectedChatCommand: (index: number) => void
    chatCommands?: [string, CodyPrompt][] | null
    selectedChatCommand?: number
    onSubmit: (input: string, inputType: ChatSubmitType) => void
}

export interface UserContextSelectorProps {
    onSelected: (context: ContextFile, input: string) => void
    formInput: string
    contextSelection?: ContextFile[]
    selected?: number
    onSubmit: (input: string, inputType: 'user') => void
    setSelectedChatContext: (arg: number) => void
}

export interface ChatContextConfig {
    useEnhancedContext: boolean
    addedContextFiles: Map<string, ContextFile>
}

export type ChatSubmitType = 'user' | 'suggestion' | 'example'

const defaultChatContextConfig: ChatContextConfig = { useEnhancedContext: true, addedContextFiles: new Map() }

export interface ChatModelSelection {
    title?: string
    model: string
    provider: string
    default: boolean
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
    symbolLinkComponent,
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
    insertButtonOnSubmit,
    suggestions,
    setSuggestions,
    needsEmailVerification = false,
    codyNotEnabledNotice: CodyNotEnabledNotice,
    needsEmailVerificationNotice: NeedsEmailVerificationNotice,
    contextStatusComponent: ContextStatusComponent,
    contextStatusComponentProps = {},
    gettingStartedComponent: GettingStartedComponent,
    gettingStartedComponentProps = {},
    abortMessageInProgressComponent: AbortMessageInProgressButton,
    onAbortMessageInProgress = () => {},
    isCodyEnabled,
    ChatButtonComponent,
    chatCommands,
    filterChatCommands,
    ChatCommandsComponent,
    isTranscriptError,
    UserContextSelectorComponent,
    contextSelection,
    chatModels,
    ChatModelDropdownMenu,
}) => {
    const [inputRows, setInputRows] = useState(1)
    const [displayCommands, setDisplayCommands] = useState<[string, CodyPrompt & { instruction?: string }][] | null>(
        chatCommands || null
    )
    const [selectedChatContext, setSelectedChatContext] = useState(0)
    const [selectedChatCommand, setSelectedChatCommand] = useState(-1)
    const [historyIndex, setHistoryIndex] = useState(inputHistory.length)

    const [contextConfig, setContextConfig] = useState({ ...defaultChatContextConfig })

    const onChatContextSelected = useCallback(
        (selected: ContextFile, input: string): void => {
            const lastAtIndex = input.lastIndexOf('@')
            if (lastAtIndex >= 0 && selected) {
                // Trim the @file portion from input
                const inputWithoutAtFileInput = input.slice(0, lastAtIndex)
                setSelectedChatContext(0)

                const isFileType = selected.kind === 'file'
                const range = selected.range ? `:${selected.range?.start.line}-${selected.range?.end.line}` : ''
                const symbolName = isFileType ? '' : `$${selected.fileName}`
                // Add empty space at the end to end the file matching process
                const fileDisplayText = `@${selected.path?.relative}${range}${symbolName} `
                const newInput = `${inputWithoutAtFileInput}${fileDisplayText}`
                setFormInput(newInput)

                // we will use the newInput as key to check if the file still exists in formInput on submit
                setContextConfig({
                    ...contextConfig,
                    addedContextFiles: new Map(contextConfig.addedContextFiles).set(fileDisplayText, selected),
                })
            }
        },
        [contextConfig, setFormInput]
    )

    // Handles selecting a chat command when the user types a slash in the chat input.
    const chatCommentSelectionHandler = useCallback(
        (inputValue: string): void => {
            if (!chatCommands || !ChatCommandsComponent) {
                return
            }
            if (inputValue === '/') {
                setDisplayCommands(chatCommands)
                setSelectedChatCommand(chatCommands.length)
                return
            }
            if (inputValue.startsWith('/')) {
                const filteredCommands = filterChatCommands
                    ? filterChatCommands(chatCommands, inputValue)
                    : chatCommands.filter(([_, prompt]) => prompt.slashCommand?.startsWith(inputValue))
                setDisplayCommands(filteredCommands)
                setSelectedChatCommand(0)
                return
            }
            setDisplayCommands(null)
            setSelectedChatCommand(-1)
        },
        [ChatCommandsComponent, chatCommands, filterChatCommands]
    )

    const inputHandler = useCallback(
        (inputValue: string): void => {
            chatCommentSelectionHandler(inputValue)
            const rowsCount = (inputValue.match(/\n/g)?.length || 0) + 1
            setInputRows(rowsCount > 25 ? 25 : rowsCount)
            setFormInput(inputValue)
            if (inputValue !== inputHistory[historyIndex]) {
                setHistoryIndex(inputHistory.length)
            }
        },
        [chatCommentSelectionHandler, historyIndex, inputHistory, setFormInput]
    )

    const submitInput = useCallback(
        (input: string, submitType: ChatSubmitType): void => {
            if (messageInProgress) {
                return
            }
            onSubmit(input, submitType, contextConfig)
            setSuggestions?.(undefined)
            setContextConfig({ ...defaultChatContextConfig })
            setSelectedChatContext(0)
            setHistoryIndex(inputHistory.length + 1)
            setInputHistory([...inputHistory, input])
            setDisplayCommands(null)
            setSelectedChatCommand(-1)
        },
        [contextConfig, inputHistory, messageInProgress, onSubmit, setInputHistory, setSuggestions]
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
            setInputRows(1)
            submitInput(formInput, 'user')
            setFormInput('')
        }
    }, [formInput, messageInProgress, setFormInput, submitInput])

    const onChatKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLElement>, caretPosition: number | null): void => {
            // Ignore alt + c key combination for editor to avoid conflict with cody shortcut
            if (event.altKey && event.key === 'c') {
                event.preventDefault()
                event.stopPropagation()
                return
            }

            // Clear & reset session on CMD+K
            if (event.metaKey && event.key === 'k') {
                onSubmit('/r', 'user', contextConfig)
                return
            }

            // Handles cycling through chat command suggestions using the up and down arrow keys
            if (displayCommands && formInput.startsWith('/')) {
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault()
                    event.stopPropagation()
                    const commandsLength = displayCommands?.length
                    const curIndex = event.key === 'ArrowUp' ? selectedChatCommand - 1 : selectedChatCommand + 1
                    const newIndex = curIndex < 0 ? commandsLength - 1 : curIndex >= commandsLength - 1 ? 0 : curIndex
                    setSelectedChatCommand(newIndex)
                    const newInput = displayCommands?.[newIndex]?.[1]?.slashCommand
                    setFormInput(newInput || formInput)
                }
                // close the chat command suggestions on escape key
                if (event.key === 'Escape') {
                    setDisplayCommands(null)
                    setSelectedChatCommand(-1)
                    setFormInput('')
                }
                // tab/enter to complete
                if (
                    (event.key === 'Tab' || event.key === 'Enter') &&
                    selectedChatCommand > -1 &&
                    displayCommands.length
                ) {
                    event.preventDefault()
                    event.stopPropagation()
                    const selectedCommand = displayCommands?.[selectedChatCommand]?.[1]
                    if (formInput.startsWith(selectedCommand?.slashCommand)) {
                        // submit message if the input has slash command already completed
                        setMessageBeingEdited(false)
                        onChatSubmit()
                    } else {
                        const newInput = selectedCommand?.slashCommand
                        setFormInput(newInput || formInput)
                    }
                }
                return
            }

            // Handles cycling through context matches on key presses
            if (contextSelection?.length && !formInput.endsWith(' ')) {
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault()
                    event.stopPropagation()
                    const selectionLength = contextSelection?.length - 1
                    const newIndex = event.key === 'ArrowUp' ? selectedChatContext - 1 : selectedChatContext + 1
                    const newMatchIndex = newIndex < 0 ? selectionLength : newIndex > selectionLength ? 0 : newIndex
                    setSelectedChatContext(newMatchIndex)
                }

                if (event.key === 'Backspace') {
                    setSelectedChatContext(0)
                }

                if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    const lastAtIndex = formInput.lastIndexOf('@')
                    if (lastAtIndex >= 0) {
                        const inputWithoutFileInput = formInput.slice(0, lastAtIndex)
                        // Remove @ from input
                        setFormInput(inputWithoutFileInput)
                    }
                    setSelectedChatContext(0)
                }

                // tab/enter to complete
                if (event.key === 'Tab' || event.key === 'Enter') {
                    event.preventDefault()
                    event.stopPropagation()
                    const selected = contextSelection[selectedChatContext]
                    onChatContextSelected(selected, formInput)
                }
                return
            }

            // Submit input on Enter press (without shift) and
            // trim the formInput to make sure input value is not empty.
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && formInput?.trim()) {
                event.preventDefault()
                event.stopPropagation()
                setMessageBeingEdited(false)
                onChatSubmit()
                return
            }

            // Loop through input history on up arrow press
            if (!inputHistory.length) {
                return
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
            displayCommands,
            formInput,
            contextSelection,
            inputHistory,
            historyIndex,
            selectedChatCommand,
            setFormInput,
            setMessageBeingEdited,
            onChatSubmit,
            selectedChatContext,
            onChatContextSelected,
            onSubmit,
            contextConfig,
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

    const isGettingStartedComponentVisible = transcript.length === 0 && GettingStartedComponent !== undefined

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
                    symbolLinkComponent={symbolLinkComponent}
                    codeBlocksCopyButtonClassName={codeBlocksCopyButtonClassName}
                    codeBlocksInsertButtonClassName={codeBlocksInsertButtonClassName}
                    transcriptItemClassName={transcriptItemClassName}
                    humanTranscriptItemClassName={humanTranscriptItemClassName}
                    transcriptItemParticipantClassName={transcriptItemParticipantClassName}
                    transcriptActionClassName={transcriptActionClassName}
                    className={isGettingStartedComponentVisible ? undefined : styles.transcriptContainer}
                    textAreaComponent={TextArea}
                    EditButtonContainer={EditButtonContainer}
                    editButtonOnSubmit={editButtonOnSubmit}
                    FeedbackButtonsContainer={FeedbackButtonsContainer}
                    feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                    copyButtonOnSubmit={copyButtonOnSubmit}
                    insertButtonOnSubmit={insertButtonOnSubmit}
                    submitButtonComponent={SubmitButton}
                    chatInputClassName={chatInputClassName}
                    ChatButtonComponent={ChatButtonComponent}
                    isTranscriptError={isTranscriptError}
                    chatModels={chatModels}
                    ChatModelDropdownMenu={ChatModelDropdownMenu}
                />
            )}

            {isGettingStartedComponentVisible && (
                <GettingStartedComponent {...gettingStartedComponentProps} submitInput={submitInput} />
            )}

            <form className={classNames(styles.inputRow, inputRowClassName)}>
                {!displayCommands && suggestions !== undefined && suggestions.length !== 0 && SuggestionButton ? (
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
                {messageInProgress && AbortMessageInProgressButton && (
                    <div className={classNames(styles.abortButtonContainer)}>
                        <AbortMessageInProgressButton onAbortMessageInProgress={onAbortMessageInProgress} />
                    </div>
                )}
                {ContextStatusComponent && <ContextStatusComponent {...contextStatusComponentProps} />}
                <div className={styles.textAreaContainer}>
                    {displayCommands && ChatCommandsComponent && formInput && (
                        <ChatCommandsComponent
                            chatCommands={displayCommands}
                            selectedChatCommand={selectedChatCommand}
                            setFormInput={setFormInput}
                            setSelectedChatCommand={setSelectedChatCommand}
                            onSubmit={onSubmit}
                        />
                    )}
                    {contextSelection && UserContextSelectorComponent && formInput && (
                        <UserContextSelectorComponent
                            selected={selectedChatContext}
                            onSelected={onChatContextSelected}
                            contextSelection={contextSelection}
                            formInput={formInput}
                            onSubmit={onSubmit}
                            setSelectedChatContext={setSelectedChatContext}
                        />
                    )}
                    <TextArea
                        className={classNames(styles.chatInput, chatInputClassName)}
                        rows={inputRows}
                        value={isCodyEnabled ? formInput : 'Cody is disabled on this instance'}
                        autoFocus={true}
                        required={true}
                        disabled={needsEmailVerification || !isCodyEnabled}
                        onInput={onChatInput}
                        onKeyDown={onChatKeyDown}
                        setValue={inputHandler}
                    />
                    <SubmitButton
                        className={styles.submitButton}
                        onClick={onChatSubmit}
                        disabled={
                            !!messageInProgress || needsEmailVerification || !isCodyEnabled || formInput.length === 0
                        }
                    />
                </div>
                {!ContextStatusComponent && contextStatus && (
                    <ChatInputContext contextStatus={contextStatus} className={chatInputContextClassName} />
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
