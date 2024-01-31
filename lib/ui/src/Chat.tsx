import type React from 'react'
import { useCallback, useMemo, useState } from 'react'

import classNames from 'classnames'

import {
    displayPath,
    isDefined,
    type ChatButton,
    type ChatInputHistory,
    type ChatMessage,
    type ChatModelProvider,
    type CodyCommand,
    type ContextFile,
    type Guardrails,
} from '@sourcegraph/cody-shared'

import type { CodeBlockMeta } from './chat/CodeBlocks'
import type { FileLinkProps } from './chat/components/EnhancedContext'
import type { SymbolLinkProps } from './chat/PreciseContext'
import { Transcript } from './chat/Transcript'
import type { TranscriptItemClassNames } from './chat/TranscriptItem'

import styles from './Chat.module.css'
import { ChatActions } from './chat/components/ChatActions'

interface ChatProps extends ChatClassNames {
    transcript: ChatMessage[]
    messageInProgress: ChatMessage | null
    messageBeingEdited: number | undefined
    setMessageBeingEdited: (index?: number) => void
    formInput: string
    setFormInput: (input: string) => void
    inputHistory: ChatInputHistory[]
    setInputHistory: (history: ChatInputHistory[]) => void
    onSubmit: (
        text: string,
        submitType: WebviewChatSubmitType,
        userContextFiles?: Map<string, ContextFile>
    ) => void
    gettingStartedComponent?: React.FunctionComponent<any>
    gettingStartedComponentProps?: any
    textAreaComponent: React.FunctionComponent<ChatUITextAreaProps>
    submitButtonComponent: React.FunctionComponent<ChatUISubmitButtonProps>
    fileLinkComponent: React.FunctionComponent<FileLinkProps>
    symbolLinkComponent: React.FunctionComponent<SymbolLinkProps>
    helpMarkdown?: string
    afterMarkdown?: string
    gettingStartedButtons?: ChatButton[]
    className?: string
    EditButtonContainer?: React.FunctionComponent<EditButtonProps>
    FeedbackButtonsContainer?: React.FunctionComponent<FeedbackButtonsProps>
    feedbackButtonsOnSubmit?: (text: string) => void
    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']
    needsEmailVerification?: boolean
    needsEmailVerificationNotice?: React.FunctionComponent
    codyNotEnabledNotice?: React.FunctionComponent
    abortMessageInProgressComponent?: React.FunctionComponent<{
        onAbortMessageInProgress: () => void
    }>
    onAbortMessageInProgress?: () => void
    isCodyEnabled: boolean
    chatEnabled: boolean
    ChatButtonComponent?: React.FunctionComponent<ChatButtonProps>
    chatCommands?: [string, CodyCommand][] | null
    filterChatCommands?: (
        chatCommands: [string, CodyCommand][],
        input: string
    ) => [string, CodyCommand][]
    ChatCommandsComponent?: React.FunctionComponent<ChatCommandsProps>
    isTranscriptError?: boolean
    contextSelection?: ContextFile[] | null
    UserContextSelectorComponent?: React.FunctionComponent<UserContextSelectorProps>
    chatModels?: ChatModelProvider[]
    EnhancedContextSettings?: React.FunctionComponent<{
        isOpen: boolean
        setOpen: (open: boolean) => void
        presentationMode: 'consumer' | 'enterprise'
    }>
    ChatModelDropdownMenu?: React.FunctionComponent<ChatModelDropdownMenuProps>
    onCurrentChatModelChange?: (model: ChatModelProvider) => void
    userInfo: UserAccountInfo
    postMessage?: ApiPostMessage
    guardrails?: Guardrails
    chatIDHistory: string[]
    isWebviewActive: boolean
}

export interface UserAccountInfo {
    isDotComUser: boolean
    isCodyProUser: boolean
}

export type ApiPostMessage = (message: any) => void

interface ChatClassNames extends TranscriptItemClassNames {
    inputRowClassName?: string
    chatInputClassName?: string
}

export interface ChatButtonProps {
    label: string
    action: string
    onClick: (action: string) => void
    appearance?: 'primary' | 'secondary' | 'icon'
}

export interface ChatUITextAreaProps {
    className: string
    rows: number
    isFocusd: boolean
    isNewChat: boolean
    value: string
    required: boolean
    chatEnabled: boolean
    disabled?: boolean
    onInput: React.FormEventHandler<HTMLTextAreaElement>
    setValue?: (value: string) => void
    onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>, caretPosition: number | null) => void
    onKeyUp?: (event: React.KeyboardEvent<HTMLTextAreaElement>, caretPosition: number | null) => void
    onFocus?: (event: React.FocusEvent<HTMLTextAreaElement>) => void
    chatModels?: ChatModelProvider[]
    messageBeingEdited: number | undefined
}

export interface ChatUISubmitButtonProps {
    type: 'user' | 'user-newchat' | 'edit'
    className: string
    disabled: boolean
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
    onAbortMessageInProgress?: () => void
}

export interface EditButtonProps {
    className: string
    disabled?: boolean
    messageBeingEdited: number | undefined
    setMessageBeingEdited: (index?: number) => void
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
    chatCommands?: [string, CodyCommand][] | null
    selectedChatCommand?: number
    onSubmit: (input: string, inputType: WebviewChatSubmitType) => void
}

export interface UserContextSelectorProps {
    onSelected: (context: ContextFile, input: string) => void
    formInput: string
    contextSelection?: ContextFile[]
    selected?: number
    onSubmit: (input: string, inputType: 'user') => void
    setSelectedChatContext: (arg: number) => void
}

export type WebviewChatSubmitType = 'user' | 'user-newchat' | 'edit'

export interface ChatModelDropdownMenuProps {
    models: ChatModelProvider[]
    disabled: boolean // Disabled when transcript length > 1
    onCurrentChatModelChange: (model: ChatModelProvider) => void
    userInfo: UserAccountInfo
}

/**
 * The Cody chat interface, with a transcript of all messages and a message form.
 */
export const Chat: React.FunctionComponent<ChatProps> = ({
    messageInProgress,
    messageBeingEdited,
    setMessageBeingEdited,
    transcript,
    formInput,
    setFormInput,
    inputHistory,
    setInputHistory,
    onSubmit,
    textAreaComponent: TextArea,
    submitButtonComponent: SubmitButton,
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
    chatInputClassName,
    EditButtonContainer,
    FeedbackButtonsContainer,
    feedbackButtonsOnSubmit,
    copyButtonOnSubmit,
    insertButtonOnSubmit,
    needsEmailVerification = false,
    codyNotEnabledNotice: CodyNotEnabledNotice,
    needsEmailVerificationNotice: NeedsEmailVerificationNotice,
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
    EnhancedContextSettings,
    chatEnabled,
    onCurrentChatModelChange,
    userInfo,
    postMessage,
    guardrails,
    chatIDHistory,
    isWebviewActive,
}) => {
    const isMac = isMacOS()
    const [inputFocus, setInputFocus] = useState(!messageInProgress?.speaker)
    const [inputRows, setInputRows] = useState(1)
    const [displayCommands, setDisplayCommands] = useState<
        [string, CodyCommand & { instruction?: string }][] | null
    >(chatCommands || null)
    const [selectedChatCommand, setSelectedChatCommand] = useState(-1)
    const [historyIndex, setHistoryIndex] = useState(inputHistory.length)

    // The context files added via the chat input by user
    const [chatContextFiles, setChatContextFiles] = useState<Map<string, ContextFile>>(new Map([]))
    const [selectedChatContext, setSelectedChatContext] = useState(0)

    // When New Chat Mode is enabled, all non-edit questions will be asked in a new chat session
    // Users can toggle this feature via "shift" + "Meta(Mac)/Control" keys
    const [enableNewChatMode, setEnableNewChatMode] = useState(false)

    const [isLastItemCommand, setIsLastItemCommand] = useState(false)

    const lastHumanMessageIndex = useMemo<number | undefined>(() => {
        if (!transcript?.length) {
            return undefined
        }
        const index = transcript.findLastIndex(msg => msg.speaker === 'human')
        const isCommand = transcript[index]?.displayText?.startsWith('/') ?? false
        setIsLastItemCommand(isCommand)
        return index
    }, [transcript])

    /**
     * Sets the state to edit a message at the given index in the transcript.
     * Checks that the index is valid, then gets the display text  to set as the
     * form input.
     *
     * An undefined index number means there is no message being edited.
     */
    const setEditMessageState = useCallback(
        (index?: number): void => {
            // When a message is no longer being edited
            // we will reset the form input fill to empty state
            if (index === undefined && index !== messageBeingEdited) {
                setFormInput('')
                setInputFocus(true)
            }
            setMessageBeingEdited(index)
            if (index === undefined || index > transcript.length) {
                return
            }

            // Only returns command name if it is the first word in the message
            // Attempts to remove markdown links
            const messageAtIndex = transcript[index]
            const displayText = messageAtIndex?.displayText
            const inputText = displayText?.startsWith('/')
                ? displayText.replaceAll(/\[_@.*\)/g, '') || displayText?.split(' ')?.[0]
                : messageAtIndex?.text
            if (inputText) {
                setFormInput(inputText)
            }
            setInputFocus(true)
        },
        [messageBeingEdited, setFormInput, setMessageBeingEdited, transcript]
    )

    /**
     * Reset current chat view with a new empty chat session.
     *
     * Calls setEditMessageState() to reset any in-progress edit state.
     * Sends a 'reset' command to postMessage to reset the chat on the server.
     */
    const onChatResetClick = useCallback(() => {
        setEditMessageState()
        postMessage?.({ command: 'reset' })
    }, [postMessage, setEditMessageState])

    // Gets the display text for a context file to be completed into the chat when a user
    // selects a file.
    //
    // This is also used to reconstruct the map from the chat history (which only stores context
    // files).
    function getContextFileDisplayText(contextFile: ContextFile): string {
        const isFileType = contextFile.type === 'file'
        const range = contextFile.range
            ? `:${contextFile.range?.start.line}-${contextFile.range?.end.line}`
            : ''
        const symbolName = isFileType ? '' : `#${contextFile.symbolName}`
        return `@${displayPath(contextFile.uri)}${range}${symbolName}`
    }

    /**
     * Callback function called when a chat context file is selected from the context selector.
     *
     * Updates the chat input with the selected file context.
     *
     * Trims any existing @file text from the input.
     * Adds the selected file path and range to the input.
     * Updates contextConfig with the new added context file.
     *
     * This allows the user to quickly insert file context into the chat input.
     */
    const onChatContextSelected = useCallback(
        (selected: ContextFile, input: string): void => {
            const lastAtIndex = input.lastIndexOf('@')
            if (lastAtIndex >= 0 && selected) {
                // Trim the @file portion from input
                const inputPrefix = input.slice(0, lastAtIndex)
                const fileDisplayText = getContextFileDisplayText(selected)
                // Add empty space at the end to end the file matching process
                const newInput = `${inputPrefix}${fileDisplayText} `

                // we will use the newInput as key to check if the file still exists in formInput on submit
                setChatContextFiles(new Map(chatContextFiles).set(fileDisplayText, selected))
                setSelectedChatContext(0)
                setFormInput(newInput)
            }
        },
        [chatContextFiles, setFormInput]
    )
    // Handles selecting a chat command when the user types a slash in the chat input.
    const chatCommentSelectionHandler = useCallback(
        (inputValue: string): void => {
            if (!chatCommands?.length || !ChatCommandsComponent) {
                return
            }
            if (inputValue === '/') {
                setDisplayCommands(chatCommands)
                setSelectedChatCommand(0)
                return
            }
            if (inputValue.startsWith('/')) {
                const splittedValue = inputValue.split(' ')
                if (splittedValue.length > 1) {
                    const matchedCommand = chatCommands.filter(([name]) => name === splittedValue[0])
                    if (matchedCommand.length === 1) {
                        setDisplayCommands(matchedCommand)
                        setSelectedChatCommand(0)
                    }
                    return
                }
                const filteredCommands = filterChatCommands
                    ? filterChatCommands(chatCommands, inputValue)
                    : chatCommands.filter(command => command[1].slashCommand?.startsWith(inputValue))
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
            if (contextSelection && inputValue) {
                setSelectedChatContext(0)
            }
            chatCommentSelectionHandler(inputValue)
            const rowsCount = (inputValue.match(/\n/g)?.length || 0) + 1
            setInputRows(rowsCount > 25 ? 25 : rowsCount)
            setFormInput(inputValue)
            const lastInput = inputHistory[historyIndex]
            const lastText = typeof lastInput === 'string' ? lastInput : lastInput?.inputText
            if (inputValue !== lastText) {
                setHistoryIndex(inputHistory.length)
            }
        },
        [contextSelection, chatCommentSelectionHandler, setFormInput, inputHistory, historyIndex]
    )

    const submitInput = useCallback(
        (input: string, submitType: WebviewChatSubmitType): void => {
            if (messageInProgress && submitType !== 'edit') {
                return
            }
            onSubmit(input, submitType, chatContextFiles)

            // Record the chat history with (optional) context files.
            const newHistory: ChatInputHistory = {
                inputText: input,
                inputContextFiles: Array.from(chatContextFiles.values()),
            }
            setHistoryIndex(inputHistory.length + 1)
            setInputHistory([...inputHistory, newHistory])

            setChatContextFiles(new Map())
            setSelectedChatContext(0)
            setDisplayCommands(null)
            setSelectedChatCommand(-1)
            setFormInput('')
            setEditMessageState()
        },
        [
            messageInProgress,
            onSubmit,
            chatContextFiles,
            inputHistory,
            setInputHistory,
            setEditMessageState,
            setFormInput,
        ]
    )
    const onChatInput = useCallback(
        ({ target }: React.SyntheticEvent) => {
            const { value } = target as HTMLInputElement
            inputHandler(value)
        },
        [inputHandler]
    )

    const onChatSubmit = useCallback((): void => {
        // Submit edits when there is one being edited
        if (messageBeingEdited !== undefined) {
            onAbortMessageInProgress()
            submitInput(formInput, 'edit')
            return
        }

        // Submit chat only when input is not empty and not in progress
        if (formInput.trim() && !messageInProgress?.speaker) {
            const submitType = enableNewChatMode ? 'user-newchat' : 'user'
            submitInput(formInput, submitType)
        }
    }, [
        formInput,
        messageBeingEdited,
        messageInProgress?.speaker,
        enableNewChatMode,
        submitInput,
        onAbortMessageInProgress,
    ])

    const onChatKeyUp = useCallback(
        (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
            // Captures Escape button clicks
            if (event.key === 'Escape') {
                // Exits editing mode if a message is being edited
                if (messageBeingEdited !== undefined) {
                    event.preventDefault()
                    setEditMessageState()
                    return
                }

                // Aborts a message in progress if one exists
                if (messageInProgress?.speaker) {
                    event.preventDefault()
                    onAbortMessageInProgress()
                    return
                }
            }
        },
        [messageBeingEdited, setEditMessageState, messageInProgress, onAbortMessageInProgress]
    )

    const onChatKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLTextAreaElement>, caretPosition: number | null): void => {
            // Check if the Ctrl key is pressed on Windows/Linux or the Cmd key is pressed on macOS
            const isModifierDown = isMac ? event.metaKey : event.ctrlKey
            if (isModifierDown) {
                // Ctrl/Cmd + / - Clears the chat and starts a new session
                if (event.key === '/') {
                    event.preventDefault()
                    event.stopPropagation()
                    onChatResetClick()
                    return
                }
                // Ctrl/Cmd + K - When not already editing, edits the last human message
                if (messageBeingEdited === undefined && event.key === 'k') {
                    event.preventDefault()
                    event.stopPropagation()
                    setEditMessageState(lastHumanMessageIndex)
                    return
                }
            }

            // Ignore alt + c key combination for editor to avoid conflict with cody shortcut
            if (event.altKey && event.key === 'c') {
                event.preventDefault()
                event.stopPropagation()
                return
            }

            // Allows backspace and delete keystrokes to remove characters
            const deleteKeysList = new Set(['Backspace', 'Delete'])
            if (deleteKeysList.has(event.key)) {
                setSelectedChatCommand(-1)
                setSelectedChatContext(0)
                return
            }

            // Handles keyboard shortcuts with Ctrl key.
            // Checks if the Ctrl key is pressed with a key not in the allow list
            // to avoid triggering default browser shortcuts and bubbling the event.
            const ctrlKeysAllowList = new Set([
                'a',
                'c',
                'v',
                'x',
                'y',
                'z',
                'Enter',
                'Shift' /* follow-up */,
            ])
            if (event.ctrlKey && !ctrlKeysAllowList.has(event.key)) {
                event.preventDefault()
                return
            }

            // Ignore alt + c key combination for editor to avoid conflict with cody shortcut
            const vscodeCodyShortcuts = new Set(['Slash', 'KeyC'])
            if (event.altKey && vscodeCodyShortcuts.has(event.code)) {
                event.preventDefault()
                return
            }

            // Handles cycling through chat command suggestions using the up and down arrow keys
            if (displayCommands && formInput.startsWith('/')) {
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault()
                    const commandsLength = displayCommands?.length
                    const curIndex =
                        event.key === 'ArrowUp' ? selectedChatCommand - 1 : selectedChatCommand + 1
                    const newIndex =
                        curIndex < 0 ? commandsLength - 1 : curIndex > commandsLength - 1 ? 0 : curIndex
                    setSelectedChatCommand(newIndex)
                    const newInput = displayCommands?.[newIndex]?.[1]?.slashCommand
                    setFormInput(newInput || formInput)
                    return
                }
                // close the chat command suggestions on escape key
                if (event.key === 'Escape') {
                    setDisplayCommands(null)
                    setSelectedChatCommand(-1)
                    setFormInput('')
                    return
                }
                // tab/enter to complete
                if ((event.key === 'Tab' || event.key === 'Enter') && displayCommands.length) {
                    event.preventDefault()
                    const selectedCommand = displayCommands?.[selectedChatCommand]?.[1]
                    if (formInput.startsWith(selectedCommand?.slashCommand)) {
                        onChatSubmit()
                    } else {
                        const newInput = selectedCommand?.slashCommand
                        setFormInput(newInput || formInput)
                        setDisplayCommands(null)
                        setSelectedChatCommand(-1)
                    }
                }
                return
            }

            // Handles cycling through context matches on key presses
            if (contextSelection?.length && !formInput.endsWith(' ')) {
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault()
                    const selectionLength = contextSelection?.length - 1
                    const newIndex =
                        event.key === 'ArrowUp' ? selectedChatContext - 1 : selectedChatContext + 1
                    const newMatchIndex =
                        newIndex < 0 ? selectionLength : newIndex > selectionLength ? 0 : newIndex
                    setSelectedChatContext(newMatchIndex)
                    return
                }
                if (event.key === 'Escape') {
                    event.preventDefault()
                    const lastAtIndex = formInput.lastIndexOf('@')
                    if (lastAtIndex >= 0) {
                        const inputWithoutFileInput = formInput.slice(0, lastAtIndex)
                        // Remove @ from input
                        setFormInput(inputWithoutFileInput)
                    }
                    setSelectedChatContext(0)
                    return
                }
                // tab/enter to complete
                if (event.key === 'Tab' || event.key === 'Enter') {
                    event.preventDefault()
                    const selected = contextSelection[selectedChatContext]
                    onChatContextSelected(selected, formInput)
                    return
                }
            }

            // Submit input on Enter press (without shift) and
            // trim the formInput to make sure input value is not empty.
            if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                formInput?.trim()
            ) {
                event.preventDefault()
                onChatSubmit()
                return
            }

            // TODO (bee) - Update to use Option key instead
            // TODO (bee) - remove once updated to use Option key
            // Toggles between new chat mode and regular chat mode
            if (event.altKey && event.shiftKey && isModifierDown) {
                // use as a temporary block for this key combination
                event.preventDefault()
                setEnableNewChatMode(!enableNewChatMode)
                return
            }

            // Loop through input history on up arrow press
            if (!inputHistory?.length) {
                return
            }

            // If there's no input or the input matches the current history index, handle cycling through
            // history with the cursor keys.
            const previousHistoryInput = inputHistory[historyIndex]
            const previousHistoryText: string =
                typeof previousHistoryInput === 'string'
                    ? previousHistoryInput
                    : previousHistoryInput?.inputText
            if (formInput === previousHistoryText || !formInput) {
                let newIndex: number | undefined
                if (event.key === 'ArrowUp' && caretPosition === 0) {
                    newIndex = historyIndex - 1 < 0 ? inputHistory.length - 1 : historyIndex - 1
                } else if (event.key === 'ArrowDown' && caretPosition === formInput.length) {
                    if (historyIndex + 1 < inputHistory.length) {
                        newIndex = historyIndex + 1
                    }
                }

                if (newIndex !== undefined) {
                    setHistoryIndex(newIndex)

                    const newHistoryInput = inputHistory[newIndex]
                    if (typeof newHistoryInput === 'string') {
                        setFormInput(newHistoryInput)
                        setChatContextFiles(new Map())
                    } else {
                        setFormInput(newHistoryInput.inputText)
                        // chatContextFiles uses a map but history only stores a simple array.
                        const contextFilesMap = new Map<string, ContextFile>()
                        for (const file of newHistoryInput.inputContextFiles) {
                            contextFilesMap.set(getContextFileDisplayText(file), file)
                        }
                        setChatContextFiles(contextFilesMap)
                    }
                }
            }
        },
        [
            isMac,
            messageBeingEdited,
            displayCommands,
            formInput,
            contextSelection,
            inputHistory,
            historyIndex,
            onChatResetClick,
            setEditMessageState,
            lastHumanMessageIndex,
            selectedChatCommand,
            setFormInput,
            onChatSubmit,
            selectedChatContext,
            onChatContextSelected,
            enableNewChatMode,
        ]
    )

    const transcriptWithWelcome = useMemo<ChatMessage[]>(
        () => [
            {
                speaker: 'assistant',
                displayText: welcomeText({ helpMarkdown, afterMarkdown }),
                buttons: gettingStartedButtons,
                data: 'welcome-text',
            },
            ...transcript,
        ],
        [helpMarkdown, afterMarkdown, gettingStartedButtons, transcript]
    )

    const isGettingStartedComponentVisible =
        transcript.length === 0 && GettingStartedComponent !== undefined

    const [isEnhancedContextOpen, setIsEnhancedContextOpen] = useState(false)

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
                    setMessageBeingEdited={setEditMessageState}
                    fileLinkComponent={fileLinkComponent}
                    symbolLinkComponent={symbolLinkComponent}
                    codeBlocksCopyButtonClassName={codeBlocksCopyButtonClassName}
                    codeBlocksInsertButtonClassName={codeBlocksInsertButtonClassName}
                    transcriptItemClassName={transcriptItemClassName}
                    humanTranscriptItemClassName={humanTranscriptItemClassName}
                    transcriptItemParticipantClassName={transcriptItemParticipantClassName}
                    transcriptActionClassName={transcriptActionClassName}
                    className={isGettingStartedComponentVisible ? undefined : styles.transcriptContainer}
                    EditButtonContainer={EditButtonContainer}
                    FeedbackButtonsContainer={FeedbackButtonsContainer}
                    feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                    copyButtonOnSubmit={copyButtonOnSubmit}
                    insertButtonOnSubmit={insertButtonOnSubmit}
                    ChatButtonComponent={ChatButtonComponent}
                    isTranscriptError={isTranscriptError}
                    chatModels={chatModels}
                    onCurrentChatModelChange={onCurrentChatModelChange}
                    ChatModelDropdownMenu={ChatModelDropdownMenu}
                    userInfo={userInfo}
                    postMessage={postMessage}
                    guardrails={guardrails}
                />
            )}
            {isGettingStartedComponentVisible && (
                <GettingStartedComponent {...gettingStartedComponentProps} submitInput={submitInput} />
            )}
            <form className={classNames(styles.inputRow, inputRowClassName)}>
                {messageInProgress && AbortMessageInProgressButton && (
                    <div className={classNames(styles.abortButtonContainer)}>
                        <AbortMessageInProgressButton
                            onAbortMessageInProgress={onAbortMessageInProgress}
                        />
                    </div>
                )}
                {/* Don't show chat action buttons on empty chat session unless it's a new cha*/}

                <ChatActions
                    setInputFocus={setInputFocus}
                    isWebviewActive={isWebviewActive}
                    isEmptyChat={transcript.length < 1}
                    isMessageInProgress={!!messageInProgress?.speaker}
                    isEditing={transcript.length > 1 && messageBeingEdited !== undefined}
                    disableEditLastMessage={isLastItemCommand}
                    onChatResetClick={onChatResetClick}
                    onCancelEditClick={() => setEditMessageState()}
                    onEditLastMessageClick={() => setEditMessageState(lastHumanMessageIndex)}
                    onRestoreLastChatClick={
                        // Display the restore button if there is a previous chat id in current window
                        // And the current chat window is new
                        chatIDHistory.length > 1
                            ? () =>
                                  postMessage?.({
                                      command: 'restoreHistory',
                                      chatID: chatIDHistory.at(-2),
                                  })
                            : undefined
                    }
                />

                <div className={styles.textAreaContainer}>
                    {displayCommands && ChatCommandsComponent && formInput.startsWith('/') && (
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
                    <div className={styles.chatInputContainer}>
                        <TextArea
                            className={classNames(styles.chatInput, chatInputClassName)}
                            rows={inputRows}
                            value={isCodyEnabled ? formInput : 'Cody is disabled on this instance'}
                            isFocusd={inputFocus}
                            required={true}
                            disabled={needsEmailVerification || !isCodyEnabled}
                            onInput={onChatInput}
                            onFocus={() => setIsEnhancedContextOpen(false)}
                            onKeyDown={onChatKeyDown}
                            onKeyUp={onChatKeyUp}
                            setValue={inputHandler}
                            chatEnabled={chatEnabled}
                            chatModels={chatModels}
                            messageBeingEdited={messageBeingEdited}
                            isNewChat={!transcript.length}
                        />
                        {EnhancedContextSettings && (
                            <div className={styles.contextButton}>
                                <EnhancedContextSettings
                                    isOpen={isEnhancedContextOpen}
                                    setOpen={setIsEnhancedContextOpen}
                                    presentationMode={userInfo.isDotComUser ? 'consumer' : 'enterprise'}
                                />
                            </div>
                        )}
                    </div>
                    <SubmitButton
                        type={
                            messageBeingEdited === undefined
                                ? enableNewChatMode
                                    ? 'user-newchat'
                                    : 'user'
                                : 'edit'
                        }
                        className={styles.submitButton}
                        onClick={onChatSubmit}
                        disabled={
                            needsEmailVerification ||
                            !isCodyEnabled ||
                            (!formInput.length && !messageInProgress)
                        }
                        onAbortMessageInProgress={
                            !AbortMessageInProgressButton && messageInProgress
                                ? onAbortMessageInProgress
                                : undefined
                        }
                    />
                </div>
            </form>
        </div>
    )
}

export function isMacOS(): boolean {
    return window.navigator.userAgent?.includes('Mac')
}

interface WelcomeTextOptions {
    /** Provide users with a way to quickly access Cody docs/help.*/
    helpMarkdown?: string
    /** Provide additional content to supplement the original message. Example: tips, privacy policy. */
    afterMarkdown?: string
}

function welcomeText({
    helpMarkdown = 'See [Cody documentation](https://sourcegraph.com/docs/cody) for help and tips.',
    afterMarkdown,
}: WelcomeTextOptions): string {
    return [helpMarkdown, afterMarkdown].filter(isDefined).join('\n\n')
}
