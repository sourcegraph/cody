import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import classNames from 'classnames'

import {
    type AuthStatus,
    type ChatMessage,
    type Guardrails,
    type TelemetryService,
    isMacOS,
} from '@sourcegraph/cody-shared'

import { EnhancedContextSettings } from './Components/EnhancedContextSettings'
import { useEnhancedContextEnabled } from './chat/EnhancedContext'
import { Transcript } from './chat/Transcript'
import {
    PromptEditor,
    type PromptEditorRefAPI,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
} from './promptEditor/PromptEditor'
import type { VSCodeWrapper } from './utils/VSCodeApi'

import styles from './Chat.module.css'

interface ChatboxProps {
    welcomeMessage?: string
    chatEnabled: boolean
    messageInProgress: ChatMessage | null
    transcript: ChatMessage[]
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage' | 'onMessage'>
    telemetryService: TelemetryService
    isTranscriptError: boolean
    userInfo: UserAccountInfo
    guardrails?: Guardrails
    isNewInstall: boolean
}

const isMac = isMacOS()

export const Chat: React.FunctionComponent<React.PropsWithChildren<ChatboxProps>> = ({
    welcomeMessage,
    messageInProgress,
    transcript,
    vscodeAPI,
    telemetryService,
    isTranscriptError,
    chatEnabled,
    userInfo,
    guardrails,
    isNewInstall,
}) => {
    // Display the enhanced context settings on first chats
    const [isEnhancedContextOpen, setIsEnhancedContextOpen] = useState(isNewInstall)

    const editorRef = useRef<PromptEditorRefAPI>(null)
    const setEditorState = useCallback((state: SerializedPromptEditorState | null) => {
        editorRef.current?.setEditorState(state)
    }, [])

    // The only PromptEditor state we really need to track in our own state is whether it's empty.
    const [isEmptyEditorValue, setIsEmptyEditorValue] = useState(true)
    const onEditorChange = useCallback((value: SerializedPromptEditorValue): void => {
        setIsEmptyEditorValue(!value?.text?.trim())
    }, [])

    const onAbortMessageInProgress = useCallback(() => {
        vscodeAPI.postMessage({ command: 'abort' })
    }, [vscodeAPI])

    const addEnhancedContext = useEnhancedContextEnabled()

    const onSubmit = useCallback(
        // TODO!(sqs)
        (submitType: WebviewChatSubmitType, messageBeingEdited: number | null) => {
            if (!editorRef.current) {
                throw new Error('Chat has no editorRef')
            }
            const editorValue = editorRef.current.getSerializedValue()
            if (!editorValue.text.trim()) {
                throw new Error('Chat message cannot be empty')
            }
            // Handle edit requests
            if (submitType === 'edit') {
                vscodeAPI.postMessage({
                    command: 'edit',
                    index: messageBeingEdited!,
                    text: editorValue.text,
                    editorState: editorValue.editorState,
                    contextFiles: editorValue.contextItems,
                    addEnhancedContext,
                })
            } else {
                vscodeAPI.postMessage({
                    command: 'submit',
                    submitType,
                    text: editorValue.text,
                    editorState: editorValue.editorState,
                    contextFiles: editorValue.contextItems,
                    addEnhancedContext,
                })
            }
        },
        [addEnhancedContext, vscodeAPI]
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
        (text: string, eventType: 'Button' | 'Keydown' = 'Button') => {
            const op = 'copy'
            // remove the additional /n added by the text area at the end of the text
            const code = eventType === 'Button' ? text.replace(/\n$/, '') : text
            // Log the event type and text to telemetry in chat view
            vscodeAPI.postMessage({
                command: op,
                eventType,
                text: code,
            })
        },
        [vscodeAPI]
    )

    const insertButtonOnSubmit = useCallback(
        (text: string, newFile = false) => {
            const op = newFile ? 'newFile' : 'insert'
            const eventType = 'Button'
            // remove the additional /n added by the text area at the end of the text
            const code = eventType === 'Button' ? text.replace(/\n$/, '') : text
            // Log the event type and text to telemetry in chat view
            vscodeAPI.postMessage({
                command: op,
                eventType,
                text: code,
            })
        },
        [vscodeAPI]
    )

    const postMessage = useCallback<ApiPostMessage>(msg => vscodeAPI.postMessage(msg), [vscodeAPI])

    const setInputFocus = useCallback((focus: boolean): void => {
        editorRef.current?.setFocus(focus)
    }, [])

    const lastHumanMessageIndex = useMemo<number | undefined>(() => {
        if (!transcript?.length) {
            return undefined
        }
        const index = transcript.findLastIndex(msg => msg.speaker === 'human')

        return index
    }, [transcript])

    /**
     * Reset current chat view with a new empty chat session.
     *
     * Calls setEditMessageState() to reset any in-progress edit state.
     * Sends a 'reset' command to postMessage to reset the chat on the server.
     */
    const onChatResetClick = useCallback(
        (eventType: 'keyDown' | 'click' = 'click') => {
            postMessage?.({ command: 'reset' })
            postMessage?.({
                command: 'event',
                eventName: 'CodyVSCodeExtension:chatActions:reset:executed',
                properties: { source: 'chat', eventType },
            })
        },
        [postMessage]
    )

    const submitInput = useCallback(
        (submitType: WebviewChatSubmitType): void => {
            if (messageInProgress && submitType !== 'edit') {
                return
            }
            onSubmit(submitType)

            setEditorState(null)
        },
        [messageInProgress, onSubmit, setEditorState]
    )

    const onChatSubmit = useCallback((): void => {
        // Submit edits when there is one being edited
        if (messageBeingEdited !== undefined) {
            onAbortMessageInProgress()
            submitInput('edit')
            return
        }

        // Submit chat only when input is not empty and not in progress
        if (!isEmptyEditorValue && !messageInProgress?.speaker) {
            submitInput('user')
        }
    }, [
        isEmptyEditorValue,
        messageBeingEdited,
        messageInProgress?.speaker,
        submitInput,
        onAbortMessageInProgress,
    ])

    const onEditorEscapeKey = useCallback((): void => {
        // Close the enhanced context settings modal if it's open
        setIsEnhancedContextOpen(false)

        // Aborts a message in progress if one exists
        if (messageInProgress?.speaker) {
            onAbortMessageInProgress()
            return
        }
    }, [messageInProgress, onAbortMessageInProgress])

    const onEditorEnterKey = useCallback(
        (event: KeyboardEvent | null): void => {
            // Submit input on Enter press (without shift) when input is not empty.
            if (event && !event.shiftKey && !event.isComposing && !isEmptyEditorValue) {
                event.preventDefault()
                onChatSubmit()
                return
            }
        },
        [onChatSubmit, isEmptyEditorValue]
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
        },
        [
            messageBeingEdited,
            isEmptyEditorValue,
            onChatResetClick,
            setEditMessageState,
            lastHumanMessageIndex,
            postMessage,
        ]
    )

    // Focus the textarea when the webview (re)gains focus (unless there is text selected or a modal
    // is open). This makes it so that the user can immediately start typing to Cody after invoking
    // `Cody: Focus on Chat View` with the keyboard.
    useEffect(() => {
        // Focus the input when the enhanced context settings modal is closed
        setInputFocus(!isEnhancedContextOpen)
        // Add window focus event listener to focus the input when the window is focused
        const handleFocus = (): void => {
            if (document.getSelection()?.isCollapsed && !isEnhancedContextOpen) {
                setInputFocus(true)
            }
        }
        window.addEventListener('focus', handleFocus)
        return () => {
            window.removeEventListener('focus', handleFocus)
        }
    }, [setInputFocus, isEnhancedContextOpen])

    // biome-ignore lint/correctness/useExhaustiveDependencies: We don't want to re-run this effect.
    const onEnhancedContextTogglerClick = useCallback((open: boolean) => {
        if (!isEnhancedContextOpen && !open) {
            setInputFocus(true)
        }
        setIsEnhancedContextOpen(open)
    }, [])

    const isNewChat = transcript.length === 0
    const TIPS = '(@ for files, @# for symbols)'
    const placeholder = chatEnabled
        ? isNewChat
            ? `Message ${TIPS}`
            : `Follow-Up Message ${TIPS}`
        : 'Chat has been disabled by your Enterprise instance site administrator'

    return (
        <div className={classNames(styles.innerContainer)}>
            {
                <Transcript
                    transcript={transcript}
                    welcomeMessage={welcomeMessage}
                    messageInProgress={messageInProgress}
                    className={styles.transcriptContainer}
                    feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                    copyButtonOnSubmit={copyButtonOnSubmit}
                    insertButtonOnSubmit={insertButtonOnSubmit}
                    isTranscriptError={isTranscriptError}
                    userInfo={userInfo}
                    postMessage={postMessage}
                    guardrails={guardrails}
                />
            }
            <form className={classNames(styles.inputRow)}>
                <div className={styles.textAreaContainer}>
                    <div className={styles.editorOuterContainer}>
                        <PromptEditor
                            placeholder={placeholder}
                            onChange={onEditorChange}
                            disabled={!chatEnabled}
                            onKeyDown={onEditorKeyDown}
                            onEnterKey={onEditorEnterKey}
                            onEscapeKey={onEditorEscapeKey}
                            editorRef={editorRef}
                        />
                        <div className={styles.contextButton}>
                            <EnhancedContextSettings
                                isOpen={isEnhancedContextOpen}
                                setOpen={onEnhancedContextTogglerClick}
                                presentationMode={userInfo.isDotComUser ? 'consumer' : 'enterprise'}
                                isNewInstall={isNewInstall}
                            />
                        </div>
                    </div>
                </div>
            </form>
        </div>
    )
}

export interface UserAccountInfo {
    isDotComUser: boolean
    isCodyProUser: boolean
    user: Pick<AuthStatus, 'username' | 'displayName' | 'avatarURL'>
}

type WebviewChatSubmitType = 'user' | 'edit'

export type ApiPostMessage = (message: any) => void
