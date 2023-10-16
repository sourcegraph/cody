import { useCallback, useEffect, useMemo, useState } from 'react'

import './App.css'

import { ChatContextStatus } from '@sourcegraph/cody-shared/src/chat/context'
import { CodyPrompt } from '@sourcegraph/cody-shared/src/chat/prompts'
import { ChatHistory, ChatMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { Configuration } from '@sourcegraph/cody-shared/src/configuration'

import { AuthMethod, AuthStatus, Experiments, LocalEnv } from '../src/chat/protocol'

import { Chat } from './Chat'
import { LoadingPage } from './LoadingPage'
import { View } from './NavBar'
import { Notices } from './Notices'
import { LoginSimplified } from './OnboardingExperiment'
import { UserHistory } from './UserHistory'
import { createWebviewTelemetryService } from './utils/telemetry'
import type { VSCodeWrapper } from './utils/VSCodeApi'

export const App: React.FunctionComponent<{ vscodeAPI: VSCodeWrapper }> = ({ vscodeAPI }) => {
    const [config, setConfig] = useState<
        (Pick<Configuration, 'debugEnable' | 'serverEndpoint'> & LocalEnv & Experiments) | null
    >(null)
    const [endpoint, setEndpoint] = useState<string | null>(null)
    const [view, setView] = useState<View | undefined>()
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    const [messageBeingEdited, setMessageBeingEdited] = useState<boolean>(false)
    const [transcript, setTranscript] = useState<ChatMessage[]>([])
    const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
    const [formInput, setFormInput] = useState('')
    const [inputHistory, setInputHistory] = useState<string[] | []>([])
    const [userHistory, setUserHistory] = useState<ChatHistory | null>(null)
    const [contextStatus, setContextStatus] = useState<ChatContextStatus | null>(null)
    const [errorMessages, setErrorMessages] = useState<string[]>([])
    const [suggestions, setSuggestions] = useState<string[] | undefined>()
    const [isAppInstalled, setIsAppInstalled] = useState<boolean>(false)
    const [myPrompts, setMyPrompts] = useState<
        [string, CodyPrompt & { isLastInGroup?: boolean; instruction?: string }][] | null
    >(null)
    const [isTranscriptError, setIsTranscriptError] = useState<boolean>(false)

    useEffect(
        () =>
            vscodeAPI.onMessage(message => {
                switch (message.type) {
                    case 'transcript': {
                        if (message.isMessageInProgress) {
                            const msgLength = message.messages.length - 1
                            setTranscript(message.messages.slice(0, msgLength))
                            setMessageInProgress(message.messages[msgLength])
                            setIsTranscriptError(false)
                        } else {
                            setTranscript(message.messages)
                            setMessageInProgress(null)
                        }
                        break
                    }
                    case 'config':
                        setConfig(message.config)
                        setIsAppInstalled(message.config.isAppInstalled)
                        setEndpoint(message.authStatus.endpoint)
                        setAuthStatus(message.authStatus)
                        setView(message.authStatus.isLoggedIn ? 'chat' : 'login')
                        break
                    case 'login':
                        break
                    case 'history':
                        setInputHistory(message.messages?.input ?? [])
                        setUserHistory(message.messages?.chat ?? null)
                        break
                    case 'contextStatus':
                        setContextStatus(message.contextStatus)
                        break
                    case 'errors':
                        setErrorMessages([...errorMessages, message.errors].slice(-5))
                        break
                    case 'view':
                        setView(message.messages)
                        break
                    case 'suggestions':
                        setSuggestions(message.suggestions)
                        break
                    case 'app-state':
                        setIsAppInstalled(message.isInstalled)
                        break
                    case 'custom-prompts': {
                        let prompts: [string, CodyPrompt & { isLastInGroup?: boolean; instruction?: string }][] =
                            message.prompts

                        if (!prompts) {
                            setMyPrompts(null)
                            break
                        }

                        prompts = prompts.reduce(groupPrompts, []).map(addInstructions)

                        // mark last prompts as last in group before adding another group
                        const lastPrompt = prompts.at(-1)
                        if (lastPrompt) {
                            const [_, command] = lastPrompt
                            command.isLastInGroup = true
                        }

                        setMyPrompts([
                            ...prompts,
                            // add another group
                            ['reset', { prompt: '', slashCommand: '/reset', description: 'Clear the chat' }],
                        ])
                        break
                    }
                    case 'transcript-errors':
                        setIsTranscriptError(message.isTranscriptError)
                        break
                }
            }),
        [errorMessages, view, vscodeAPI]
    )

    useEffect(() => {
        // Notify the extension host that we are ready to receive events
        vscodeAPI.postMessage({ command: 'ready' })
    }, [vscodeAPI])

    useEffect(() => {
        if (!view) {
            vscodeAPI.postMessage({ command: 'initialized' })
        }
    }, [view, vscodeAPI])

    const simplifiedLoginRedirect = useCallback(
        (method: AuthMethod) => {
            // We do not change the view here. We want to keep presenting the
            // login buttons until we get a token so users don't get stuck if
            // they close the browser during an auth flow.
            vscodeAPI.postMessage({ command: 'auth', type: 'simplified-onboarding', authMethod: method })
        },
        [vscodeAPI]
    )

    // Callbacks used for app setup after simplified onboarding
    const onboardingPopupProps = {
        installApp: () => {
            vscodeAPI.postMessage({ command: 'simplified-onboarding', type: 'install-app' })
        },
        openApp: () => {
            vscodeAPI.postMessage({ command: 'simplified-onboarding', type: 'open-app' })
        },
        reloadStatus: () => {
            vscodeAPI.postMessage({ command: 'simplified-onboarding', type: 'reload-state' })
        },
    }

    const telemetryService = useMemo(() => createWebviewTelemetryService(vscodeAPI), [vscodeAPI])

    if (!view || !authStatus || !config) {
        return <LoadingPage />
    }

    return (
        <div className="outer-container">
            {view === 'login' || !authStatus.isLoggedIn ? (
                <LoginSimplified
                    simplifiedLoginRedirect={simplifiedLoginRedirect}
                    telemetryService={telemetryService}
                    uiKindIsWeb={config?.uiKindIsWeb}
                    vscodeAPI={vscodeAPI}
                />
            ) : (
                <>
                    <Notices
                        extensionVersion={config?.extensionVersion}
                        probablyNewInstall={!!userHistory && Object.entries(userHistory).length === 0}
                    />
                    {errorMessages && <ErrorBanner errors={errorMessages} setErrors={setErrorMessages} />}
                    {view === 'history' && (
                        <UserHistory
                            userHistory={userHistory}
                            setUserHistory={setUserHistory}
                            setInputHistory={setInputHistory}
                            setView={setView}
                            vscodeAPI={vscodeAPI}
                        />
                    )}
                    {view === 'chat' && (
                        <Chat
                            messageInProgress={messageInProgress}
                            messageBeingEdited={messageBeingEdited}
                            setMessageBeingEdited={setMessageBeingEdited}
                            transcript={transcript}
                            contextStatus={contextStatus}
                            formInput={formInput}
                            setFormInput={setFormInput}
                            inputHistory={inputHistory}
                            setInputHistory={setInputHistory}
                            vscodeAPI={vscodeAPI}
                            suggestions={suggestions}
                            setSuggestions={setSuggestions}
                            telemetryService={telemetryService}
                            chatCommands={myPrompts || undefined}
                            isTranscriptError={isTranscriptError}
                            applessOnboarding={{
                                arm: config.experimentOnboarding,
                                endpoint,
                                embeddingsEndpoint: contextStatus?.embeddingsEndpoint,
                                props: {
                                    isAppInstalled,
                                    onboardingPopupProps,
                                },
                            }}
                        />
                    )}
                </>
            )}
        </div>
    )
}

const ErrorBanner: React.FunctionComponent<{ errors: string[]; setErrors: (errors: string[]) => void }> = ({
    errors,
    setErrors,
}) => (
    <div className="error-container">
        {errors.map((error, i) => (
            <div key={i} className="error">
                <span>{error}</span>
                <button type="button" className="close-btn" onClick={() => setErrors(errors.filter(e => e !== error))}>
                    ×
                </button>
            </div>
        ))}
    </div>
)

/**
 * Adds `isLastInGroup` field to a prompt if represents last item in a group (e.g., default/custom/etc. prompts).
 */
function groupPrompts(
    acc: [string, CodyPrompt & { isLastInGroup?: boolean }][],
    [key, command]: [string, CodyPrompt],
    index: number,
    array: [string, CodyPrompt][]
): [string, CodyPrompt & { isLastInGroup?: boolean }][] {
    if (key === 'separator') {
        return acc
    }

    const nextItem = array[index + 1]
    if (nextItem?.[0] === 'separator') {
        acc.push([key, { ...command, isLastInGroup: true }])
        return acc
    }

    acc.push([key, command])
    return acc
}

const instructionLabels: Record<string, string> = {
    '/ask': '[question]',
    '/edit': '[instruction]',
}

/**
 * Adds `instruction` field to a prompt if it requires additional instruction.
 */
function addInstructions<T extends CodyPrompt>([key, command]: [string, T]): [string, T & { instruction?: string }] {
    const instruction = instructionLabels[command.slashCommand]
    return [key, { ...command, instruction }]
}
