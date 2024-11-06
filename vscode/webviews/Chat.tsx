import type React from 'react'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import type {
    AuthenticatedAuthStatus,
    ChatMessage,
    CodyIDE,
    Guardrails,
    Model,
    PromptString,
} from '@sourcegraph/cody-shared'
import { Transcript, focusLastHumanMessageEditor } from './chat/Transcript'
import type { VSCodeWrapper } from './utils/VSCodeApi'

import { truncateTextStart } from '@sourcegraph/cody-shared/src/prompt/truncation'
import { CHAT_INPUT_TOKEN_BUDGET } from '@sourcegraph/cody-shared/src/token/constants'
import styles from './Chat.module.css'
import WelcomeFooter from './chat/components/WelcomeFooter'
import { WelcomeMessage } from './chat/components/WelcomeMessage'
import { ScrollDown } from './components/ScrollDown'
import type { View } from './tabs'
import { useTelemetryRecorder } from './utils/telemetry'
import { useUserAccountInfo } from './utils/useConfig'
import { trace, SpanStatusCode } from '@opentelemetry/api'

interface ChatboxProps {
    chatEnabled: boolean
    messageInProgress: ChatMessage | null
    transcript: ChatMessage[]
    models: Model[]
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage' | 'onMessage'>
    guardrails?: Guardrails
    scrollableParent?: HTMLElement | null
    showWelcomeMessage?: boolean
    showIDESnippetActions?: boolean
    setView: (view: View) => void
    smartApplyEnabled?: boolean
    isPromptsV2Enabled?: boolean
}

export const Chat: React.FunctionComponent<React.PropsWithChildren<ChatboxProps>> = ({
    messageInProgress,
    transcript,
    models,
    vscodeAPI,
    chatEnabled = true,
    guardrails,
    scrollableParent,
    showWelcomeMessage = true,
    showIDESnippetActions = true,
    setView,
    smartApplyEnabled,
    isPromptsV2Enabled,
}) => {
    const telemetryRecorder = useTelemetryRecorder()

    const transcriptRef = useRef(transcript)
    transcriptRef.current = transcript

    const userInfo = useUserAccountInfo()

    const feedbackButtonsOnSubmit = useCallback(
        (text: string) => {
            const tracer = trace.getTracer('cody-webview')
            
            return tracer.startActiveSpan('feedback-submit', async (span) => {
                try {
                    enum FeedbackType {
                        thumbsUp = 1,
                        thumbsDown = 0,
                    }

                    span.setAttributes({
                        'feedback.type': text === 'thumbsUp' ? 'positive' : 'negative',
                        'user.isDotComUser': userInfo.isDotComUser,
                    })

                    telemetryRecorder.recordEvent('cody.feedback', 'submit', {
                        metadata: {
                            feedbackType: text === 'thumbsUp' ? FeedbackType.thumbsUp : FeedbackType.thumbsDown,
                            recordsPrivateMetadataTranscript: userInfo.isDotComUser ? 1 : 0,
                        },
                        privateMetadata: {
                            FeedbackText: text,
                            responseText: userInfo.isDotComUser
                                ? truncateTextStart(transcriptRef.current.toString(), CHAT_INPUT_TOKEN_BUDGET)
                                : '',
                        },
                        billingMetadata: {
                            product: 'cody',
                            category: 'billable',
                        },
                    })

                    span.setStatus({ code: SpanStatusCode.OK })
                } catch (error) {
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: error instanceof Error ? error.message : 'Unknown error'
                    })
                    span.recordException(error as Error)
                    throw error
                } finally {
                    span.end()
                }
            })
        },
        [userInfo, telemetryRecorder]
    )

    const copyButtonOnSubmit = useCallback(
        (text: string, eventType: 'Button' | 'Keydown' = 'Button') => {
            const tracer = trace.getTracer('cody-webview')
            
            return tracer.startActiveSpan('copy-text', async (span) => {
                try {
                    const op = 'copy'
                    span.setAttributes({
                        'copy.eventType': eventType,
                        'copy.textLength': text.length,
                    })

                    // remove the additional /n added by the text area at the end of the text
                    const code = eventType === 'Button' ? text.replace(/\n$/, '') : text
                    
                    // Log the event type and text to telemetry in chat view
                    vscodeAPI.postMessage({
                        command: op,
                        eventType,
                        text: code,
                    })

                    span.setStatus({ code: SpanStatusCode.OK })
                } catch (error) {
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: error instanceof Error ? error.message : 'Unknown error'
                    })
                    span.recordException(error as Error)
                    throw error
                } finally {
                    span.end()
                }
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
        const tracer = trace.getTracer('cody-webview')
    
        const span = tracer.startSpan('component-lifecycle', {
            attributes: {
                'component.name': 'Chat',
                'component.event': 'mount'
            }
        })
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
            span.end()
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
                models={models}
                messageInProgress={messageInProgress}
                feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                copyButtonOnSubmit={copyButtonOnSubmit}
                insertButtonOnSubmit={insertButtonOnSubmit}
                smartApply={smartApply}
                userInfo={userInfo}
                chatEnabled={chatEnabled}
                postMessage={postMessage}
                guardrails={guardrails}
                smartApplyEnabled={smartApplyEnabled}
            />
            {transcript.length === 0 && showWelcomeMessage && (
                <>
                    <WelcomeMessage
                        IDE={userInfo.IDE}
                        setView={setView}
                        isPromptsV2Enabled={isPromptsV2Enabled}
                    />
                    <WelcomeFooter IDE={userInfo.IDE} />
                </>
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
        'username' | 'displayName' | 'avatarURL' | 'endpoint' | 'primaryEmail' | 'organizations'
    >
    IDE: CodyIDE
}

export type ApiPostMessage = (message: any) => void
