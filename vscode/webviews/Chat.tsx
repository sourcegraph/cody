import type React from 'react'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import type {
    AuthenticatedAuthStatus,
    ChatMessage,
    CodyIDE,
    Guardrails,
    PromptString,
} from '@sourcegraph/cody-shared'
import { Transcript, focusLastHumanMessageEditor } from './chat/Transcript'
import type { VSCodeWrapper } from './utils/VSCodeApi'

import { truncateTextStart } from '@sourcegraph/cody-shared/src/prompt/truncation'
import { CHAT_INPUT_TOKEN_BUDGET } from '@sourcegraph/cody-shared/src/token/constants'
import styles from './Chat.module.css'
import { WelcomeMessage } from './chat/components/WelcomeMessage'
import { ScrollDown } from './components/ScrollDown'
import type { View } from './tabs'
import { useTelemetryRecorder } from './utils/telemetry'
import { useUserAccountInfo } from './utils/useConfig'

interface ChatboxProps {
    chatEnabled: boolean
    messageInProgress: ChatMessage | null
    transcript: ChatMessage[]
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage' | 'onMessage'>
    isTranscriptError: boolean
    guardrails?: Guardrails
    scrollableParent?: HTMLElement | null
    showWelcomeMessage?: boolean
    showIDESnippetActions?: boolean
    setView: (view: View) => void
    smartApplyEnabled?: boolean
}

export const Chat: React.FunctionComponent<React.PropsWithChildren<ChatboxProps>> = ({
    messageInProgress,
    transcript,
    vscodeAPI,
    isTranscriptError,
    chatEnabled = true,
    guardrails,
    scrollableParent,
    showWelcomeMessage = true,
    showIDESnippetActions = true,
    setView,
    smartApplyEnabled,
}) => {
    const telemetryRecorder = useTelemetryRecorder()

    const transcriptRef = useRef(transcript)
    transcriptRef.current = transcript

    const userInfo = useUserAccountInfo()

    const feedbackButtonsOnSubmit = useCallback(
        (text: string) => {
            enum FeedbackType {
                thumbsUp = 1,
                thumbsDown = 0,
            }
            telemetryRecorder.recordEvent('cody.feedback', 'submit', {
                metadata: {
                    feedbackType: text === 'thumbsUp' ? FeedbackType.thumbsUp : FeedbackType.thumbsDown,
                    lastChatUsedEmbeddings: transcriptRef.current
                        .at(-1)
                        ?.contextFiles?.some(file => file.source === 'embeddings')
                        ? 1
                        : 0,
                    recordsPrivateMetadataTranscript: userInfo.isDotComUser ? 1 : 0,
                },
                privateMetadata: {
                    FeedbackText: text,

                    // 🚨 SECURITY: chat transcripts are to be included only for DotCom users AND for V2 telemetry
                    // V2 telemetry exports privateMetadata only for DotCom users
                    // the condition below is an aditional safegaurd measure
                    responseText: userInfo.isDotComUser
                        ? truncateTextStart(transcriptRef.current.toString(), CHAT_INPUT_TOKEN_BUDGET)
                        : '',
                },
                billingMetadata: {
                    product: 'cody',
                    category: 'billable',
                },
            })
        },
        [userInfo, telemetryRecorder]
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

    const insertButtonOnSubmit = useMemo(() => {
        if (showIDESnippetActions) {
            return (text: string, newFile = false) => {
                const op = newFile ? 'newFile' : 'insert'
                // Log the event type and text to telemetry in chat view
                vscodeAPI.postMessage({
                    command: op,
                    // remove the additional /n added by the text area at the end of the text
                    text: text.replace(/\n$/, ''),
                })
            }
        }

        return
    }, [vscodeAPI, showIDESnippetActions])

    const smartApply = useMemo(() => {
        if (!showIDESnippetActions) {
            return
        }

        return {
            onSubmit: (
                id: string,
                text: string,
                instruction?: PromptString,
                fileName?: string
            ): void => {
                vscodeAPI.postMessage({
                    command: 'smartApplySubmit',
                    id,
                    instruction: instruction?.toString(),
                    // remove the additional /n added by the text area at the end of the text
                    code: text.replace(/\n$/, ''),
                    fileName,
                })
            },
            onAccept: (id: string) => {
                vscodeAPI.postMessage({
                    command: 'smartApplyAccept',
                    id,
                })
            },
            onReject: (id: string) => {
                vscodeAPI.postMessage({
                    command: 'smartApplyReject',
                    id,
                })
            },
        }
    }, [vscodeAPI, showIDESnippetActions])

    const postMessage = useCallback<ApiPostMessage>(msg => vscodeAPI.postMessage(msg), [vscodeAPI])

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            // Esc to abort the message in progress.
            if (event.key === 'Escape' && messageInProgress) {
                vscodeAPI.postMessage({ command: 'abort' })
            }

            // NOTE(sqs): I have a keybinding on my Linux machine Super+o to switch VS Code editor
            // groups. This makes it so that that keybinding does not also input the letter 'o'.
            // This is a workaround for (arguably) a VS Code issue.
            if (event.metaKey && event.key === 'o') {
                event.preventDefault()
                event.stopPropagation()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [vscodeAPI, messageInProgress])

    // Re-focus the input when the webview (re)gains focus if it was focused before the webview lost
    // focus. This makes it so that the user can easily switch back to the Cody view and keep
    // typing.
    useEffect(() => {
        const onFocus = (): void => {
            // This works because for some reason Electron maintains the Selection but not the
            // focus.
            const sel = window.getSelection()
            const focusNode = sel?.focusNode
            const focusElement = focusNode instanceof Element ? focusNode : focusNode?.parentElement
            const focusEditor = focusElement?.closest<HTMLElement>('[data-lexical-editor="true"]')
            if (focusEditor) {
                focusEditor.focus({ preventScroll: true })
            }
        }
        window.addEventListener('focus', onFocus)
        return () => {
            window.removeEventListener('focus', onFocus)
        }
    }, [])

    const handleScrollDownClick = useCallback(() => {
        // Scroll to the bottom instead of focus input for unsent message
        // it's possible that we just want to scroll to the bottom in case of
        // welcome message screen
        if (transcript.length === 0) {
            return
        }

        focusLastHumanMessageEditor()
    }, [transcript])

    return (
        <>
            {!chatEnabled && (
                <div className={styles.chatDisabled}>
                    Cody chat is disabled by your Sourcegraph site administrator
                </div>
            )}
            <Transcript
                transcript={transcript}
                messageInProgress={messageInProgress}
                feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                copyButtonOnSubmit={copyButtonOnSubmit}
                insertButtonOnSubmit={insertButtonOnSubmit}
                smartApply={smartApply}
                isTranscriptError={isTranscriptError}
                userInfo={userInfo}
                chatEnabled={chatEnabled}
                postMessage={postMessage}
                guardrails={guardrails}
                smartApplyEnabled={smartApplyEnabled}
            />
            {transcript.length === 0 && showWelcomeMessage && (
                <WelcomeMessage IDE={userInfo.ide} setView={setView} />
            )}
            {scrollableParent && (
                <ScrollDown scrollableParent={scrollableParent} onClick={handleScrollDownClick} />
            )}
        </>
    )
}

export interface UserAccountInfo {
    isDotComUser: boolean
    isCodyProUser: boolean
    user: Pick<
        AuthenticatedAuthStatus,
        'username' | 'displayName' | 'avatarURL' | 'endpoint' | 'primaryEmail'
    >
    ide: CodyIDE
}

export type ApiPostMessage = (message: any) => void
