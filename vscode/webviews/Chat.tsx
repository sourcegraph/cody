import { clsx } from 'clsx'
import type React from 'react'
import { useCallback, useEffect } from 'react'

import type { AuthStatus, ChatMessage, Guardrails, TelemetryService } from '@sourcegraph/cody-shared'
import { Transcript, focusLastHumanMessageEditor } from './chat/Transcript'
import type { VSCodeWrapper } from './utils/VSCodeApi'

import { truncateTextStart } from '@sourcegraph/cody-shared/src/prompt/truncation'
import { CHAT_INPUT_TOKEN_BUDGET } from '@sourcegraph/cody-shared/src/token/constants'
import styles from './Chat.module.css'
import { WelcomeMessage } from './chat/components/WelcomeMessage'
import { ScrollDown } from './components/ScrollDown'
import { useTelemetryRecorder } from './utils/telemetry'

interface ChatboxProps {
    chatEnabled: boolean
    messageInProgress: ChatMessage | null
    transcript: ChatMessage[]
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage' | 'onMessage'>
    telemetryService: TelemetryService
    isTranscriptError: boolean
    userInfo: UserAccountInfo
    guardrails?: Guardrails
}

export const Chat: React.FunctionComponent<React.PropsWithChildren<ChatboxProps>> = ({
    messageInProgress,
    transcript,
    vscodeAPI,
    telemetryService,

    isTranscriptError,
    chatEnabled = true,
    userInfo,
    guardrails,
}) => {
    const telemetryRecorder = useTelemetryRecorder()

    const feedbackButtonsOnSubmit = useCallback(
        (text: string) => {
            const eventData = {
                value: text,
                lastChatUsedEmbeddings: Boolean(
                    transcript.at(-1)?.contextFiles?.some(file => file.source === 'embeddings')
                ),
            }

            telemetryService.log(`CodyVSCodeExtension:codyFeedback:${text}`, eventData, {
                hasV2Event: true,
            })
            enum FeedbackType {
                thumbsUp = 1,
                thumbsDown = 0,
            }
            telemetryRecorder.recordEvent('cody.feedback', 'submit', {
                metadata: {
                    feedbackType: text === 'thumbsUp' ? FeedbackType.thumbsUp : FeedbackType.thumbsDown,
                    lastChatUsedEmbeddings: transcript
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
                        ? truncateTextStart(transcript.toString(), CHAT_INPUT_TOKEN_BUDGET)
                        : '',
                },
            })
        },
        [telemetryService, transcript, userInfo, telemetryRecorder]
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

    return (
        <div className={clsx(styles.container, 'tw-relative')}>
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
                isTranscriptError={isTranscriptError}
                userInfo={userInfo}
                chatEnabled={chatEnabled}
                postMessage={postMessage}
                guardrails={guardrails}
            />
            {transcript.length === 0 && <WelcomeMessage />}
            <ScrollDown onClick={focusLastHumanMessageEditor} />
        </div>
    )
}

export interface UserAccountInfo {
    isDotComUser: boolean
    isCodyProUser: boolean
    user: Pick<AuthStatus, 'username' | 'displayName' | 'avatarURL'>
}

export type ApiPostMessage = (message: any) => void
