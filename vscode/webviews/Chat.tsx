import { clsx } from 'clsx'
import type React from 'react'
import { useCallback, useEffect } from 'react'

import type {
    AuthStatus,
    ChatMessage,
    ContextItem,
    Guardrails,
    TelemetryRecorder,
    TelemetryService,
} from '@sourcegraph/cody-shared'
import { Transcript } from './chat/Transcript'
import type { VSCodeWrapper } from './utils/VSCodeApi'

import { truncateTextStart } from '@sourcegraph/cody-shared/src/prompt/truncation'
import { CHAT_INPUT_TOKEN_BUDGET } from '@sourcegraph/cody-shared/src/token/constants'
import styles from './Chat.module.css'

interface ChatboxProps {
    welcomeMessage?: string
    chatEnabled: boolean
    messageInProgress: ChatMessage | null
    transcript: ChatMessage[]
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage' | 'onMessage'>
    telemetryService: TelemetryService
    telemetryRecorder: TelemetryRecorder
    isTranscriptError: boolean
    userInfo: UserAccountInfo
    guardrails?: Guardrails
    isNewInstall: boolean
    userContextFromSelection?: ContextItem[]
}

export const Chat: React.FunctionComponent<React.PropsWithChildren<ChatboxProps>> = ({
    welcomeMessage,
    messageInProgress,
    transcript,
    vscodeAPI,
    telemetryService,
    telemetryRecorder,
    isTranscriptError,
    chatEnabled = true,
    userInfo,
    guardrails,
    isNewInstall,
    userContextFromSelection,
}) => {
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
            // Opt+> and Alt+> focus the last editor input, to make it easy for users to ask a followup
            // question.
            if (event.altKey && event.key === '>') {
                event.preventDefault()
                event.stopPropagation()
                const allEditors = document.querySelectorAll<HTMLElement>('[data-lexical-editor="true"]')
                const lastEditor = allEditors.item(allEditors.length - 1) as HTMLElement | undefined
                lastEditor?.focus()
            }

            // Esc to abort the message in progress.
            if (event.key === 'Escape' && messageInProgress) {
                vscodeAPI.postMessage({ command: 'abort' })
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [vscodeAPI, messageInProgress])

    return (
        <div className={clsx(styles.container)}>
            {!chatEnabled && (
                <div className={styles.chatDisabled}>
                    Cody chat is disabled by your Sourcegraph site administrator
                </div>
            )}
            <Transcript
                transcript={transcript}
                welcomeMessage={welcomeMessage}
                messageInProgress={messageInProgress}
                feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                copyButtonOnSubmit={copyButtonOnSubmit}
                insertButtonOnSubmit={insertButtonOnSubmit}
                isTranscriptError={isTranscriptError}
                userInfo={userInfo}
                isNewInstall={isNewInstall}
                chatEnabled={chatEnabled}
                userContextFromSelection={userContextFromSelection}
                postMessage={postMessage}
                guardrails={guardrails}
            />
        </div>
    )
}

export interface UserAccountInfo {
    isDotComUser: boolean
    isCodyProUser: boolean
    user: Pick<AuthStatus, 'username' | 'displayName' | 'avatarURL'>
}

export type ApiPostMessage = (message: any) => void
