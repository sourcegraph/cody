import { clsx } from 'clsx'
import type React from 'react'
import { useCallback, useEffect, useMemo } from 'react'

import type {
    AuthStatus,
    ChatMessage,
    CodyIDE,
    ContextItem,
    Guardrails,
    PromptString,
} from '@sourcegraph/cody-shared'
import { Transcript, focusLastHumanMessageEditor } from './chat/Transcript'
import type { VSCodeWrapper } from './utils/VSCodeApi'

import { truncateTextStart } from '@sourcegraph/cody-shared/src/prompt/truncation'
import { CHAT_INPUT_TOKEN_BUDGET } from '@sourcegraph/cody-shared/src/token/constants'
import { useChatContextMentionProviders } from '@sourcegraph/prompt-editor'
import styles from './Chat.module.css'
import { GenerateUnitTestsButton } from './chat/components/GenerateUnitTestsButton'
import { WelcomeMessage } from './chat/components/WelcomeMessage'
import { ScrollDown } from './components/ScrollDown'
import { useTelemetryRecorder } from './utils/telemetry'

interface ChatboxProps {
    chatID: string
    chatEnabled: boolean
    messageInProgress: ChatMessage | null
    transcript: ChatMessage[]
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage' | 'onMessage'>
    isTranscriptError: boolean
    userInfo: UserAccountInfo
    guardrails?: Guardrails
    scrollableParent?: HTMLElement | null
    showWelcomeMessage?: boolean
    showIDESnippetActions?: boolean
    className?: string
    experimentalUnitTestEnabled?: boolean
}

export const Chat: React.FunctionComponent<React.PropsWithChildren<ChatboxProps>> = ({
    chatID,
    messageInProgress,
    transcript,
    vscodeAPI,
    isTranscriptError,
    chatEnabled = true,
    userInfo,
    guardrails,
    scrollableParent,
    showWelcomeMessage = true,
    showIDESnippetActions = true,
    className,
    experimentalUnitTestEnabled,
}) => {
    const { reload: reloadMentionProviders } = useChatContextMentionProviders()
    const telemetryRecorder = useTelemetryRecorder()
    const feedbackButtonsOnSubmit = useCallback(
        (text: string) => {
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
        [transcript, userInfo, telemetryRecorder]
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

    const smartApplyButtonOnSubmit = useMemo(() => {
        if (!showIDESnippetActions) {
            return
        }

        return (text: string, instruction?: PromptString, contextFiles?: ContextItem[]) => {
            // Log the event type and text to telemetry in chat view
            vscodeAPI.postMessage({
                command: 'smartApply',
                instruction: instruction?.toString(),
                // remove the additional /n added by the text area at the end of the text
                code: text.replace(/\n$/, ''),
                contextFiles,
            })
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

    // biome-ignore lint/correctness/useExhaustiveDependencies: needs to run when is dotcom status is changing to update openctx providers
    useEffect(() => {
        reloadMentionProviders()
    }, [userInfo.isDotComUser, reloadMentionProviders])

    const showUnitTestsButton = experimentalUnitTestEnabled && transcript.length === 0

    return (
        <div className={clsx(styles.container, className, 'tw-relative')}>
            {!chatEnabled && (
                <div className={styles.chatDisabled}>
                    Cody chat is disabled by your Sourcegraph site administrator
                </div>
            )}
            <Transcript
                chatID={chatID}
                transcript={transcript}
                messageInProgress={messageInProgress}
                feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                copyButtonOnSubmit={copyButtonOnSubmit}
                insertButtonOnSubmit={insertButtonOnSubmit}
                smartApplyButtonOnSubmit={smartApplyButtonOnSubmit}
                isTranscriptError={isTranscriptError}
                userInfo={userInfo}
                chatEnabled={chatEnabled}
                postMessage={postMessage}
                guardrails={guardrails}
            />
            {showUnitTestsButton && <GenerateUnitTestsButton postMessage={postMessage} />}
            {transcript.length === 0 && showWelcomeMessage && <WelcomeMessage IDE={userInfo.ide} />}
            <ScrollDown scrollableParent={scrollableParent} onClick={focusLastHumanMessageEditor} />
        </div>
    )
}

export interface UserAccountInfo {
    isDotComUser: boolean
    isCodyProUser: boolean
    user: Pick<AuthStatus, 'username' | 'displayName' | 'avatarURL' | 'endpoint' | 'primaryEmail'>
    ide: CodyIDE
}

export type ApiPostMessage = (message: any) => void
