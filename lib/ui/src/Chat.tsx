import type React from 'react'
import { useCallback, useMemo, useState } from 'react'

import classNames from 'classnames'

import {
    isDefined,
    type ChatButton,
    type ChatInputHistory,
    type ChatMessage,
    type ModelProvider,
    type CodyCommand,
    type ContextFile,
    type Guardrails,
    getContextFileDisplayText,
    displayPath,
    getAtMentionQuery,
    getAtMentionedInputText,
    isAtMention,
    isAtRange,
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
    setContextSelection: (context: ContextFile[] | null) => void
    UserContextSelectorComponent?: React.FunctionComponent<UserContextSelectorProps>
    chatModels?: ModelProvider[]
    EnhancedContextSettings?: React.FunctionComponent<{
        isOpen: boolean
        setOpen: (open: boolean) => void
        presentationMode: 'consumer' | 'enterprise'
    }>
    ChatModelDropdownMenu?: React.FunctionComponent<ChatModelDropdownMenuProps>
    onCurrentChatModelChange?: (model: ModelProvider) => void
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
    chatModels?: ModelProvider[]
    messageBeingEdited: number | undefined
    inputCaretPosition?: number
    isWebviewActive: boolean
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
    onSelected: (context: ContextFile, queryEndsWithColon?: boolean) => void
    formInput: string
    contextSelection?: ContextFile[]
    selected?: number
    onSubmit: (input: string, inputType: 'user') => void
    setSelectedChatContext: (arg: number) => void
    contextQuery: string
}

export type WebviewChatSubmitType = 'user' | 'user-newchat' | 'edit'

export interface ChatModelDropdownMenuProps {
    models: ModelProvider[]
    disabled: boolean // Disabled when transcript length > 1
    onCurrentChatModelChange: (model: ModelProvider) => void
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
    isTranscriptError,
    UserContextSelectorComponent,
    contextSelection,
    setContextSelection,
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

    // This is used to keep track of the current position of the text input caret and for updating
    // the caret position to the altered text after selecting a context file to insert to the input.
    const [inputCaretPosition, setInputCaretPosition] = useState<number | undefined>(undefined)

    const [historyIndex, setHistoryIndex] = useState(inputHistory.length)

    // The context files added via the chat input by user
    const [chatContextFiles, setChatContextFiles] = useState<Map<string, ContextFile>>(new Map([]))
    const [selectedChatContext, setSelectedChatContext] = useState(0)
    const [currentChatContextQuery, setCurrentChatContextQuery] = useState<string | undefined>(undefined)

    // When New Chat Mode is enabled, all non-edit questions will be asked in a new chat session
    // Users can toggle this feature via "shift" + "Meta(Mac)/Control" keys
    const [enableNewChatMode, setEnableNewChatMode] = useState(false)

    const lastHumanMessageIndex = useMemo<number | undefined>(() => {
        if (!transcript?.length) {
            return undefined
        }
        const index = transcript.findLastIndex(msg => msg.speaker === 'human')

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
            const inputText = messageAtIndex?.text
            if (inputText) {
                setFormInput(inputText)
                if (messageAtIndex.contextFiles) {
                    useOldChatMessageContext(messageAtIndex.contextFiles)
                }
            }
            // move focus back to chatbox
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
    const onChatResetClick = useCallback(
        (eventType: 'keyDown' | 'click' = 'click') => {
            setEditMessageState()
            postMessage?.({ command: 'reset' })
            postMessage?.({
                command: 'event',
                eventName: 'CodyVSCodeExtension:chatActions:reset:executed',
                properties: { source: 'chat', eventType },
            })
        },
        [postMessage, setEditMessageState]
    )

    /**
     * Resets the context selection and query state.
     */
    const resetContextSelection = useCallback(
        (eventType?: 'keyDown' | 'click') => {
            setSelectedChatContext(0)
            setCurrentChatContextQuery(undefined)
            setContextSelection(null)
        },
        [setContextSelection]
    )

    // Add old context files from the transcript to the map
    const useOldChatMessageContext = (oldContextFiles: ContextFile[]) => {
        const contextFilesMap = new Map<string, ContextFile>(chatContextFiles)
        for (const file of oldContextFiles) {
            const fileDisplayText = getContextFileDisplayText(file)
            contextFilesMap.set(fileDisplayText, file)
        }
        setChatContextFiles(contextFilesMap)
    }

    /**
     * Callback function called when a chat context file is selected from the context selector.
     * This updates the chat input with the selected file context.
     *
     * Allows users to quickly insert file context into the chat input.
     */
    const onChatContextSelected = useCallback(
        (selected: ContextFile, queryEndsWithColon = false): void => {
            const atRangeEndingRegex = /:\d+(-\d+)?$/
            const inputBeforeCaret = formInput.slice(0, inputCaretPosition)
            const isSettingRange = atRangeEndingRegex.test(inputBeforeCaret)
            if (chatContextFiles.has(`@${displayPath(selected.uri)}`)) {
                if (isSettingRange) {
                    // Add a space after inputBeforeCaret to formInput
                    setFormInput(formInput.replace(inputBeforeCaret, inputBeforeCaret + ' '))
                    setInputCaretPosition(formInput.length + 1)
                    resetContextSelection()
                    return
                }
            }

            const fileDisplayText = getContextFileDisplayText(selected, inputBeforeCaret)
            if (inputCaretPosition && fileDisplayText) {
                const newDisplayInput = getAtMentionedInputText(
                    fileDisplayText,
                    formInput,
                    inputCaretPosition,
                    queryEndsWithColon
                )

                if (newDisplayInput) {
                    // Updates contextConfig with the new added context file.
                    // We will use the newInput as key to check if the file still exists in formInput on submit
                    const storedFileName = fileDisplayText.replace(atRangeEndingRegex, '')
                    setChatContextFiles(new Map(chatContextFiles).set(storedFileName, selected))
                    setFormInput(newDisplayInput.newInput)
                    // Move the caret to the end of the newly added file display text,
                    // including the length of text exisited before the lastAtIndex
                    // + 1 empty whitespace added after the fileDisplayText
                    setInputCaretPosition(newDisplayInput.newInputCaretPosition)
                }
            }
            resetContextSelection() // RESET
        },
        [
            formInput,
            chatContextFiles,
            setFormInput,
            inputCaretPosition,
            resetContextSelection,
            // setContextSelection,
        ]
    )

    /**
     * Callback function to handle at mentions in the chat input.
     *
     * Checks if the text before the caret in the chat input contains an '@' symbol,
     * and if so extracts the text after the last '@' up to the caret position as the
     * mention query.
     */
    const atMentionInputHandler = useCallback(
        (inputValue: string, caretPosition?: number) => {
            // If any of these conditions are false, it indicates an invalid state
            // where the necessary inputs for processing the at-mention are missing.
            if (!postMessage || !inputValue || !caretPosition) {
                // Resets the context selection and query state.
                resetContextSelection()
                return
            }

            const mentionQuery = getAtMentionQuery(inputValue, caretPosition)
            const query = mentionQuery.replace(/^@/, '')

            // Filters invalid queries and sets context query state accordingly:
            // Sets the current chat context query state if a valid mention is detected.
            // Otherwise resets the context selection and query state.
            if (!isAtMention(mentionQuery) && !isAtRange(mentionQuery)) {
                resetContextSelection()
                return
            }

            setCurrentChatContextQuery(query)

            if (isAtRange(mentionQuery)) {
                if (contextSelection?.length) {
                    setContextSelection([contextSelection[0]])
                    return
                }
                // The actual file query shouldn't contain the range input
                postMessage({ command: 'getUserContext', query: query.replace(/:[^ ]*$/, '') })
                return
            }

            if (contextSelection?.length) {
                // Cover cases where user prefer to type the file without expicitly select it
                const isEndWithSpace = query.trimEnd() === currentChatContextQuery
                const isAtRange = /:\d+(-\d+)?$/.test(query)
                if (isEndWithSpace || isAtRange) {
                    onChatContextSelected(contextSelection[0])
                    return
                }
            }

            // Posts a getUserContext command to fetch context for the mention query.
            postMessage({ command: 'getUserContext', query })
        },
        [
            postMessage,
            resetContextSelection,
            contextSelection,
            setContextSelection,
            currentChatContextQuery,
            onChatContextSelected,
        ]
    )

    const inputHandler = useCallback(
        (inputValue: string): void => {
            if (contextSelection && inputValue) {
                setSelectedChatContext(0)
            }
            const rowsCount = (inputValue.match(/\n/g)?.length || 0) + 1
            setInputRows(rowsCount > 25 ? 25 : rowsCount)
            setFormInput(inputValue)
            const lastInput = inputHistory[historyIndex]
            const lastText = typeof lastInput === 'string' ? lastInput : lastInput?.inputText
            if (inputValue !== lastText) {
                setHistoryIndex(inputHistory.length)
            }
        },
        [contextSelection, setFormInput, inputHistory, historyIndex]
    )

    const submitInput = useCallback(
        (input: string, submitType: WebviewChatSubmitType): void => {
            if (messageInProgress && submitType !== 'edit') {
                return
            }
            resetContextSelection()
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
            resetContextSelection,
        ]
    )

    const onChatInput = useCallback(
        (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
            const { value, selectionStart, selectionEnd } = event.currentTarget
            inputHandler(value)

            const hasSelection = selectionStart !== selectionEnd
            const caretPosition = hasSelection ? undefined : selectionStart
            setInputCaretPosition(caretPosition)
            atMentionInputHandler(value, caretPosition)
        },
        [inputHandler, atMentionInputHandler]
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
            // Check if the current input has an active selection instead of cursor position
            const isSelection = event.currentTarget?.selectionStart !== event.currentTarget?.selectionEnd
            setInputCaretPosition(isSelection ? undefined : event.currentTarget?.selectionStart)

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
            // Left & right arrow to hide the context suggestion popover
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                resetContextSelection()
            }

            // Check if the Ctrl key is pressed on Windows/Linux or the Cmd key is pressed on macOS
            const isModifierDown = isMac ? event.metaKey : event.ctrlKey
            if (isModifierDown) {
                // Ctrl/Cmd + / - Clears the chat and starts a new session
                if (event.key === '/') {
                    event.preventDefault()
                    event.stopPropagation()
                    onChatResetClick('keyDown')
                    return
                }
                // Ctrl/Cmd + K - When not already editing, edits the last human message
                if (messageBeingEdited === undefined && event.key === 'k') {
                    event.preventDefault()
                    event.stopPropagation()
                    setEditMessageState(lastHumanMessageIndex)

                    postMessage?.({
                        command: 'event',
                        eventName: 'CodyVSCodeExtension:chatActions:editLast:executed',
                        properties: { source: 'chat', eventType: 'keyDown' },
                    })
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
                setSelectedChatContext(0)
                return
            }

            // Allow navigation/selection with Ctrl(+Shift?)+Arrows
            const arrowKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
            if (event.ctrlKey && arrowKeys.has(event.key)) {
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

            // Handles cycling through context matches on key presses
            if (contextSelection?.length) {
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

                // Escape to hide the suggestion popover
                if (event.key === 'Escape') {
                    event.preventDefault()
                    resetContextSelection()
                    return
                }

                // tab/enter to complete
                if (event.key === 'Tab' || event.key === 'Enter') {
                    event.preventDefault()
                    const contextIndex = /(^| )@[^ ]*:\d+(-\d+)?$/.test(formInput)
                        ? 0
                        : selectedChatContext
                    onChatContextSelected(contextSelection[contextIndex])
                    return
                }

                // Close the popover on space
                if (event.key === 'Space') {
                    resetContextSelection()
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
                        useOldChatMessageContext(newHistoryInput.inputContextFiles)
                    }

                    postMessage?.({
                        command: 'event',
                        eventName: 'CodyVSCodeExtension:chatInputHistory:executed',
                        properties: { source: 'chat' },
                    })
                }
            }
        },
        [
            isMac,
            messageBeingEdited,
            formInput,
            contextSelection,
            inputHistory,
            historyIndex,
            onChatResetClick,
            setEditMessageState,
            lastHumanMessageIndex,
            setFormInput,
            onChatSubmit,
            selectedChatContext,
            onChatContextSelected,
            enableNewChatMode,
            resetContextSelection,
            useOldChatMessageContext,
            postMessage,
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
                    {contextSelection &&
                        inputCaretPosition &&
                        UserContextSelectorComponent &&
                        currentChatContextQuery !== undefined && (
                            <UserContextSelectorComponent
                                selected={selectedChatContext}
                                onSelected={onChatContextSelected}
                                contextSelection={contextSelection}
                                formInput={'@' + currentChatContextQuery}
                                onSubmit={onSubmit}
                                setSelectedChatContext={setSelectedChatContext}
                                contextQuery={currentChatContextQuery ?? ''}
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
                            inputCaretPosition={isWebviewActive ? inputCaretPosition : undefined}
                            isWebviewActive={isWebviewActive}
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
