import type { Context } from '@opentelemetry/api'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
    AuthenticatedAuthStatus,
    ChatMessage,
    CodyIDE,
    Guardrails,
    Model,
    PromptString,
} from '@sourcegraph/cody-shared'

import styles from './Chat.module.css'
import { Transcript } from './chat/Transcript'

import type { View } from './tabs'
import type { VSCodeWrapper } from './utils/VSCodeApi'
import { SpanManager } from './utils/spanManager'
import { getTraceparentFromSpanContext } from './utils/telemetry'
import { useUserAccountInfo } from './utils/useConfig'

interface ChatboxProps {
    chatEnabled: boolean
    chatCodeHighlightingEnabled: boolean
    messageInProgress: ChatMessage | null
    transcript: ChatMessage[]
    tokenUsage?:
        | {
              completionTokens?: number | null | undefined
              promptTokens?: number | null | undefined
              totalTokens?: number | null | undefined
          }
        | null
        | undefined
    models: Model[]
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage' | 'onMessage'>
    guardrails: Guardrails
    showWelcomeMessage?: boolean
    showIDESnippetActions?: boolean
    setView: (view: View) => void
    isWorkspacesUpgradeCtaEnabled?: boolean
}

export const Chat: React.FunctionComponent<React.PropsWithChildren<ChatboxProps>> = ({
    messageInProgress,
    transcript,
    tokenUsage,
    models,
    vscodeAPI,
    chatEnabled = true,
    chatCodeHighlightingEnabled = true,
    guardrails,
    showWelcomeMessage = true,
    showIDESnippetActions = true,
    setView,
    isWorkspacesUpgradeCtaEnabled,
}) => {
    const transcriptRef = useRef(transcript)
    transcriptRef.current = transcript

    const userInfo = useUserAccountInfo()

    const copyButtonOnSubmit = useCallback(
        (text: string, eventType: 'Button' | 'Keydown' = 'Button') => {
            const op = 'copy'
            // remove the additional newline added by the text area at the end of the text

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

        function onSubmit({
            id,
            text,
            instruction,
            fileName,
            isPrefetch,
        }: {
            id: string
            text: string
            isPrefetch?: boolean
            instruction?: PromptString
            fileName?: string
        }) {
            const command = isPrefetch ? 'smartApplyPrefetch' : 'smartApplySubmit'

            const spanManager = new SpanManager('cody-webview')
            const span = spanManager.startSpan(command, {
                attributes: {
                    sampled: true,
                    'smartApply.id': id,
                },
            })
            const traceparent = getTraceparentFromSpanContext(span.spanContext())

            vscodeAPI.postMessage({
                command,
                id,
                instruction: instruction?.toString(),
                // remove the additional /n added by the text area at the end of the text
                code: text.replace(/\n$/, ''),
                fileName,
                traceparent,
            })
            span.end()
        }

        return {
            onSubmit,
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

    const [activeChatContext, setActiveChatContext] = useState<Context>()

    return (
        <>
            {!chatEnabled && (
                <div className={styles.chatDisabled}>
                    Cody chat is disabled by your Sourcegraph site administrator
                </div>
            )}
            <Transcript
                activeChatContext={activeChatContext}
                setActiveChatContext={setActiveChatContext}
                transcript={transcript}
                tokenUsage={tokenUsage}
                models={models}
                messageInProgress={messageInProgress}
                copyButtonOnSubmit={copyButtonOnSubmit}
                insertButtonOnSubmit={insertButtonOnSubmit}
                smartApply={smartApply}
                userInfo={userInfo}
                chatEnabled={chatEnabled}
                chatCodeHighlightingEnabled={chatCodeHighlightingEnabled}
                postMessage={postMessage}
                guardrails={guardrails}
            />
        </>
    )
}

export interface UserAccountInfo {
    user: Pick<
        AuthenticatedAuthStatus,
        'username' | 'displayName' | 'avatarURL' | 'endpoint' | 'primaryEmail' | 'organizations'
    >
    IDE: CodyIDE
    siteHasCodyEnabled?: boolean | null
}

export type ApiPostMessage = (message: any) => void
