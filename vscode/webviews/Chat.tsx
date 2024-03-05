import type React from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { VSCodeButton, VSCodeLink } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import {
    type ChatMessage,
    type ContextItem,
    type Guardrails,
    type ModelProvider,
    type TelemetryService,
    isDefined,
    isMacOS,
} from '@sourcegraph/cody-shared'

import { CODY_FEEDBACK_URL } from '../src/chat/protocol'
import type { CodeBlockMeta } from './chat/CodeBlocks'
import { useEnhancedContextEnabled } from './chat/components/EnhancedContext'

import { ChatModelDropdownMenu } from './Components/ChatModelDropdownMenu'
import { EnhancedContextSettings } from './Components/EnhancedContextSettings'
import { FileLink } from './Components/FileLink'
import { Transcript } from './chat/Transcript'
import { ChatActions } from './chat/components/ChatActions'
import {
    EMPTY_PROMPT_EDITOR_VALUE,
    PromptEditor,
    type PromptEditorRefAPI,
    type PromptEditorValue,
    contextItemsFromPromptEditorValue,
    createEditorValueFromText,
} from './promptEditor/PromptEditor'
import { type VSCodeWrapper, getVSCodeAPI } from './utils/VSCodeApi'

import styles from './Chat.module.css'
import { deserializeContextItem } from './promptEditor/nodes/ContextItemMentionNode'

interface ChatboxProps {
    welcomeMessage?: string
    chatEnabled: boolean
    messageInProgress: ChatMessage | null
    transcript: ChatMessage[]
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage' | 'onMessage'>
    telemetryService: TelemetryService
    isTranscriptError: boolean
    setChatModels?: (models: ModelProvider[]) => void
    chatModels?: ModelProvider[]
    userInfo: UserAccountInfo
    guardrails?: Guardrails
    chatIDHistory: string[]
    isWebviewActive: boolean
}

const isMac = isMacOS()

export const Chat: React.FunctionComponent<React.PropsWithChildren<ChatboxProps>> = ({
    welcomeMessage,
    messageInProgress,
    transcript,
    vscodeAPI,
    telemetryService,
    isTranscriptError,
    setChatModels,
    chatModels,
    chatEnabled,
    userInfo,
    guardrails,
    chatIDHistory,
    isWebviewActive,
}) => {
    const [messageBeingEdited, setMessageBeingEdited] = useState<number | undefined>(undefined)

    const [editorValue, setEditorValue] = useState<PromptEditorValue>(EMPTY_PROMPT_EDITOR_VALUE)
    const editorRef = useRef<PromptEditorRefAPI>(null)
    const resetEditorValue = useCallback((value: PromptEditorValue) => {
        setEditorValue(value)
        editorRef.current?.resetValue(value)
    }, [])

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
        (value: PromptEditorValue, submitType: WebviewChatSubmitType) => {
            const contextItems = contextItemsFromPromptEditorValue(value).map(deserializeContextItem)

            // Handle edit requests
            if (submitType === 'edit') {
                if (messageBeingEdited !== undefined) {
                    onEditSubmit(value.text, messageBeingEdited, contextItems)
                }
                return
            }

            vscodeAPI.postMessage({
                command: 'submit',
                submitType,
                text: value.text,
                addEnhancedContext,
                contextFiles: contextItems,
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

    const postMessage = useCallback<ApiPostMessage>(msg => vscodeAPI.postMessage(msg), [vscodeAPI])

    const setInputFocus = useCallback((focus: boolean): void => {
        editorRef.current?.setFocus(focus)
    }, [])

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
                resetEditorValue(createEditorValueFromText(''))
            }
            setMessageBeingEdited(index)
            if (index === undefined || index > transcript.length) {
                return
            }

            const messageAtIndex = transcript[index]
            if (messageAtIndex) {
                resetEditorValue(
                    createEditorValueFromText(messageAtIndex.text ?? '', messageAtIndex.contextFiles)
                )
            }
            // move focus back to chatbox
            setInputFocus(true)
        },
        [messageBeingEdited, transcript, resetEditorValue, setInputFocus]
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

    const onEditorChange = useCallback((value: PromptEditorValue): void => {
        setEditorValue(value)
    }, [])

    const submitInput = useCallback(
        (value: PromptEditorValue, submitType: WebviewChatSubmitType): void => {
            if (messageInProgress && submitType !== 'edit') {
                return
            }
            onSubmit(value, submitType)

            resetEditorValue(EMPTY_PROMPT_EDITOR_VALUE)
            setEditMessageState()
        },
        [messageInProgress, onSubmit, setEditMessageState, resetEditorValue]
    )

    const onChatSubmit = useCallback((): void => {
        // Submit edits when there is one being edited
        if (messageBeingEdited !== undefined) {
            onAbortMessageInProgress()
            submitInput(editorValue, 'edit')
            return
        }

        // Submit chat only when input is not empty and not in progress
        if (editorValue?.text && !messageInProgress?.speaker) {
            const submitType = enableNewChatMode ? 'user-newchat' : 'user'
            submitInput(editorValue, submitType)
        }
    }, [
        editorValue,
        messageBeingEdited,
        messageInProgress?.speaker,
        enableNewChatMode,
        submitInput,
        onAbortMessageInProgress,
    ])

    const onEditorEscapeKey = useCallback((): void => {
        // Exits editing mode if a message is being edited
        if (messageBeingEdited !== undefined) {
            setEditMessageState()
            return
        }

        // Aborts a message in progress if one exists
        if (messageInProgress?.speaker) {
            onAbortMessageInProgress()
            return
        }
    }, [messageBeingEdited, setEditMessageState, messageInProgress, onAbortMessageInProgress])

    const onEditorEnterKey = useCallback(
        (event: KeyboardEvent | null): void => {
            // Submit input on Enter press (without shift) and trim the editorValue to make sure
            // input value is not empty.
            if (event && !event.shiftKey && !event.isComposing && editorValue.text.length > 0) {
                event.preventDefault()
                onChatSubmit()
                return
            }
        },
        [editorValue, onChatSubmit]
    )

    const onEditorKeyDown = useCallback(
        (event: KeyboardEvent, caretPosition: number): void => {
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

            // TODO (bee) - Update to use Option key instead
            // TODO (bee) - remove once updated to use Option key
            // Toggles between new chat mode and regular chat mode
            if (event.altKey && event.shiftKey && isModifierDown) {
                // use as a temporary block for this key combination
                event.preventDefault()
                setEnableNewChatMode(!enableNewChatMode)
                return
            }

            // If there's no input and ArrowUp is pressed, edit the last message.
            if (event.key === 'ArrowUp' && editorValue.text === '') {
                setEditMessageState(lastHumanMessageIndex)
            }
        },
        [
            messageBeingEdited,
            editorValue,
            onChatResetClick,
            setEditMessageState,
            lastHumanMessageIndex,
            enableNewChatMode,
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
                    <div className={styles.editorOuterContainer}>
                        <PromptEditor
                            containerClassName={styles.editorInnerContainer}
                            initialValue={editorValue}
                            onChange={onEditorChange}
                            onFocus={() => setIsEnhancedContextOpen(false)}
                            chatEnabled={chatEnabled}
                            isNewChat={!transcript.length}
                            onKeyDown={onEditorKeyDown}
                            onEnterKey={onEditorEnterKey}
                            onEscapeKey={onEditorEscapeKey}
                            editorRef={editorRef}
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
                        disabled={!editorValue?.text && !messageInProgress}
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
