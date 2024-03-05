import type React from 'react'
import { useCallback, useMemo, useState } from 'react'

import { VSCodeButton, VSCodeLink } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import {
    type ChatInputHistory,
    type ChatMessage,
    type ContextItem,
    type Guardrails,
    type ModelProvider,
    type TelemetryService,
    getAtMentionQuery,
    getAtMentionedInputText,
    getContextFileDisplayText,
    isAtMention,
    isAtRange,
    isDefined,
    isMacOS,
} from '@sourcegraph/cody-shared'

import { CODY_FEEDBACK_URL } from '../src/chat/protocol'
import type { CodeBlockMeta } from './chat/CodeBlocks'
import { TextArea } from './chat/TextArea'
import { useEnhancedContextEnabled } from './chat/components/EnhancedContext'

import { type VSCodeWrapper, getVSCodeAPI } from './utils/VSCodeApi'

import { verifyContextFilesFromInput } from '@sourcegraph/cody-shared/src/chat/input/user-context'
import styles from './Chat.module.css'
import { ChatModelDropdownMenu } from './Components/ChatModelDropdownMenu'
import { EnhancedContextSettings } from './Components/EnhancedContextSettings'
import { FileLink } from './Components/FileLink'
import { UserContextSelectorComponent } from './UserContextSelector'
import { Transcript } from './chat/Transcript'
import { ChatActions } from './chat/components/ChatActions'

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
    const onAbortMessageInProgress = useCallback(() => {
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

    const feedbackButtonsOnSubmit = useCallback(
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

    const copyButtonOnSubmit = useCallback(
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

    const insertButtonOnSubmit = useCallback(
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

    const isCodyEnabled = true
    const postMessage: ApiPostMessage = msg => vscodeAPI.postMessage(msg)

    const needsEmailVerification = false

    //////////// LIB COPIED HERE TODO(sqs)

    const isMac = isMacOS()
    const [inputFocus, setInputFocus] = useState(!messageInProgress?.speaker)
    const [inputRows, setInputRows] = useState(1)

    // This is used to keep track of the current position of the text input caret and for updating
    // the caret position to the altered text after selecting a context file to insert to the input.
    const [inputCaretPosition, setInputCaretPosition] = useState<number | undefined>(undefined)

    const [historyIndex, setHistoryIndex] = useState(inputHistory.length)

    // The context files added via the chat input by user
    const [chatContextFiles, setChatContextFiles] = useState<Map<string, ContextItem>>(new Map([]))
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
    const useOldChatMessageContext = (oldContextFiles: ContextItem[]) => {
        const contextFilesMap = new Map<string, ContextItem>(chatContextFiles)
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
        (selected: ContextItem, queryEndsWithColon = false): void => {
            const atRangeEndingRegex = /:\d+(-\d+)?$/
            const inputBeforeCaret = formInput.slice(0, inputCaretPosition)

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
                displayText: welcomeText({ welcomeMessage }),
            },
            ...transcript,
        ],
        [welcomeMessage, transcript]
    )

    const [isEnhancedContextOpen, setIsEnhancedContextOpen] = useState(false)

    return (
        <div className={classNames(styles.innerContainer)}>
            {
                <Transcript
                    transcript={transcriptWithWelcome}
                    messageInProgress={messageInProgress}
                    messageBeingEdited={messageBeingEdited}
                    setMessageBeingEdited={setEditMessageState}
                    fileLinkComponent={FileLink}
                    codeBlocksCopyButtonClassName={styles.codeBlocksCopyButton}
                    codeBlocksInsertButtonClassName={styles.codeBlocksInsertButton}
                    transcriptItemClassName={styles.transcriptItem}
                    humanTranscriptItemClassName={styles.humanTranscriptItem}
                    transcriptItemParticipantClassName={styles.transcriptItemParticipant}
                    transcriptActionClassName={styles.transcriptAction}
                    className={styles.transcriptContainer}
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
            }
            <form className={classNames(styles.inputRow)}>
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
                    {contextSelection && inputCaretPosition && currentChatContextQuery !== undefined && (
                        <UserContextSelectorComponent
                            selected={selectedChatContext}
                            onSelected={onChatContextSelected}
                            contextSelection={contextSelection}
                            onSubmit={onSubmit}
                            setSelectedChatContext={setSelectedChatContext}
                            contextQuery={currentChatContextQuery ?? ''}
                        />
                    )}
                    <div className={styles.chatInputContainer}>
                        <TextArea
                            containerClassName={styles.chatInputContainer}
                            inputClassName={styles.chatInput}
                            disabledClassName={styles.textareaDisabled}
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
                        <div className={styles.contextButton}>
                            <EnhancedContextSettings
                                isOpen={isEnhancedContextOpen}
                                setOpen={setIsEnhancedContextOpen}
                                presentationMode={userInfo.isDotComUser ? 'consumer' : 'enterprise'}
                            />
                        </div>
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
                            messageInProgress ? onAbortMessageInProgress : undefined
                        }
                    />
                </div>
            </form>
        </div>
    )
}

export interface ChatButtonProps {
    label: string
    action: string
    onClick: (action: string) => void
    appearance?: 'primary' | 'secondary' | 'icon'
}

const ChatButtonComponent: React.FunctionComponent<ChatButtonProps> = ({
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

const submitButtonTypes = {
    user: { icon: 'codicon codicon-arrow-up', title: 'Send Message' },
    edit: { icon: 'codicon codicon-check', title: 'Update Message' },
    'user-newchat': {
        icon: 'codicon codicon-add',
        title: 'Start New Chat Session',
    },
    abort: { icon: 'codicon codicon-debug-stop', title: 'Stop Generating' },
}

interface ChatUISubmitButtonProps {
    type: 'user' | 'user-newchat' | 'edit'
    className: string
    disabled: boolean
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
    onAbortMessageInProgress?: () => void
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

export interface EditButtonProps {
    className: string
    disabled?: boolean
    messageBeingEdited: number | undefined
    setMessageBeingEdited: (index?: number) => void
}

const EditButtonContainer: React.FunctionComponent<EditButtonProps> = ({
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

export interface FeedbackButtonsProps {
    className: string
    disabled?: boolean
    feedbackButtonsOnSubmit: (text: string) => void
}

const FeedbackButtonsContainer: React.FunctionComponent<FeedbackButtonsProps> = ({
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

interface WelcomeTextOptions {
    /** Provide users with a way to quickly access Cody docs/help.*/
    helpMarkdown?: string
    /** Provide additional content to supplement the original message. Example: tips, privacy policy. */
    welcomeMessage?: string
}

function welcomeText({
    helpMarkdown = 'See [Cody documentation](https://sourcegraph.com/docs/cody) for help and tips.',
    welcomeMessage,
}: WelcomeTextOptions): string {
    return [helpMarkdown, welcomeMessage].filter(isDefined).join('\n\n')
}

export interface UserAccountInfo {
    isDotComUser: boolean
    isCodyProUser: boolean
}

type WebviewChatSubmitType = 'user' | 'user-newchat' | 'edit'

export type ApiPostMessage = (message: any) => void
