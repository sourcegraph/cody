import { useCallback, useEffect, useMemo, useState } from 'react'

import styles from './App.module.css'

import {
    type AuthStatus,
    type ChatMessage,
    type ClientStateForWebview,
    GuardrailsPost,
    type Model,
    PromptString,
    type SerializedChatTranscript,
} from '@sourcegraph/cody-shared'
import type { UserAccountInfo } from './Chat'

import type { AuthMethod, ConfigurationSubsetForWebview, LocalEnv } from '../src/chat/protocol'

import { Chat } from './Chat'
import { LoadingPage } from './LoadingPage'
import type { View } from './NavBar'
import { Notices } from './Notices'
import { LoginSimplified } from './OnboardingExperiment'
import { ConnectionIssuesPage } from './Troubleshooting'
import { type ChatModelContext, ChatModelContextProvider } from './chat/models/chatModelContext'
import { ClientStateContextProvider, useClientActionDispatcher } from './client/clientState'
import { WithContextProviders } from './mentions/providers'
import type { VSCodeWrapper } from './utils/VSCodeApi'
import { updateDisplayPathEnvInfoForWebview } from './utils/displayPathEnvInfo'
import {
    TelemetryRecorderContext,
    createWebviewTelemetryRecorder,
    createWebviewTelemetryService,
} from './utils/telemetry'

export const App: React.FunctionComponent<{ vscodeAPI: VSCodeWrapper }> = ({ vscodeAPI }) => {
    const [config, setConfig] = useState<(LocalEnv & ConfigurationSubsetForWebview) | null>(null)
    const [view, setView] = useState<View | undefined>()
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)

    const [transcript, setTranscript] = useState<ChatMessage[]>([])

    const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
    const [userAccountInfo, setUserAccountInfo] = useState<UserAccountInfo>()

    const [userHistory, setUserHistory] = useState<SerializedChatTranscript[]>()
    const [chatIDHistory, setChatIDHistory] = useState<string[]>([])

    const [errorMessages, setErrorMessages] = useState<string[]>([])
    const [isTranscriptError, setIsTranscriptError] = useState<boolean>(false)

    const [chatModels, setChatModels] = useState<Model[]>()

    const [chatEnabled, setChatEnabled] = useState<boolean>(true)
    const [attributionEnabled, setAttributionEnabled] = useState<boolean>(false)

    const [clientState, setClientState] = useState<ClientStateForWebview>({
        initialContext: [],
    })
    const dispatchClientAction = useClientActionDispatcher()

    const guardrails = useMemo(() => {
        return new GuardrailsPost((snippet: string) => {
            vscodeAPI.postMessage({
                command: 'attribution-search',
                snippet,
            })
        })
    }, [vscodeAPI])

    // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally refresh on `view`
    useEffect(
        () =>
            vscodeAPI.onMessage(message => {
                switch (message.type) {
                    case 'transcript': {
                        const deserializedMessages = message.messages.map(
                            PromptString.unsafe_deserializeChatMessage
                        )
                        if (message.isMessageInProgress) {
                            const msgLength = deserializedMessages.length - 1
                            setTranscript(deserializedMessages.slice(0, msgLength))
                            setMessageInProgress(deserializedMessages[msgLength])
                            setIsTranscriptError(false)
                        } else {
                            setTranscript(deserializedMessages)
                            setMessageInProgress(null)
                        }
                        setChatIDHistory([...chatIDHistory, message.chatID])
                        vscodeAPI.setState(message.chatID)
                        break
                    }
                    case 'config':
                        setConfig(message.config)
                        setAuthStatus(message.authStatus)
                        setUserAccountInfo({
                            isCodyProUser: !message.authStatus.userCanUpgrade,
                            // Receive this value from the extension backend to make it work
                            // with E2E tests where change the DOTCOM_URL via the env variable TESTING_DOTCOM_URL.
                            isDotComUser: message.authStatus.isDotCom,
                            user: message.authStatus,
                        })
                        setView(message.authStatus.isLoggedIn ? 'chat' : 'login')
                        updateDisplayPathEnvInfoForWebview(message.workspaceFolderUris)
                        // Get chat models
                        if (message.authStatus.isLoggedIn) {
                            vscodeAPI.postMessage({ command: 'get-chat-models' })
                        }
                        break
                    case 'setConfigFeatures':
                        setChatEnabled(message.configFeatures.chat)
                        setAttributionEnabled(message.configFeatures.attribution)
                        break
                    case 'history':
                        setUserHistory(Object.values(message.localHistory?.chat ?? {}))
                        break
                    case 'clientAction':
                        dispatchClientAction(message)
                        break
                    case 'clientState':
                        setClientState(message.value)
                        break
                    case 'errors':
                        setErrorMessages([...errorMessages, message.errors].slice(-5))
                        break
                    case 'view':
                        setView(message.view)
                        break
                    case 'transcript-errors':
                        setIsTranscriptError(message.isTranscriptError)
                        break
                    case 'chatModels':
                        setChatModels(message.models)
                        break
                    case 'attribution':
                        if (message.attribution) {
                            guardrails.notifyAttributionSuccess(message.snippet, {
                                repositories: message.attribution.repositoryNames.map(name => {
                                    return { name }
                                }),
                                limitHit: message.attribution.limitHit,
                            })
                        }
                        if (message.error) {
                            guardrails.notifyAttributionFailure(
                                message.snippet,
                                new Error(message.error)
                            )
                        }
                        break
                }
            }),
        [errorMessages, view, vscodeAPI, guardrails, dispatchClientAction]
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

    const loginRedirect = useCallback(
        (method: AuthMethod) => {
            // We do not change the view here. We want to keep presenting the
            // login buttons until we get a token so users don't get stuck if
            // they close the browser during an auth flow.
            vscodeAPI.postMessage({
                command: 'auth',
                authKind: 'simplified-onboarding',
                authMethod: method,
            })
        },
        [vscodeAPI]
    )

    // Deprecated V1 telemetry
    const telemetryService = useMemo(() => createWebviewTelemetryService(vscodeAPI), [vscodeAPI])
    // V2 telemetry recorder
    const telemetryRecorder = useMemo(() => createWebviewTelemetryRecorder(vscodeAPI), [vscodeAPI])

    // Is this user a new installation?
    const isNewInstall = useMemo(() => !userHistory?.some(c => c?.interactions?.length), [userHistory])

    const onCurrentChatModelChange = useCallback(
        (selected: Model): void => {
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
        [chatModels, vscodeAPI]
    )
    const chatModelContext = useMemo<ChatModelContext>(
        () => ({ chatModels, onCurrentChatModelChange }),
        [chatModels, onCurrentChatModelChange]
    )

    // Wait for all the data to be loaded before rendering Chat View
    if (!view || !authStatus || !config) {
        return <LoadingPage />
    }

    if (authStatus.showNetworkError) {
        return (
            <div className={styles.outerContainer}>
                <TelemetryRecorderContext.Provider value={telemetryRecorder}>
                    <ConnectionIssuesPage
                        configuredEndpoint={authStatus.endpoint}
                        vscodeAPI={vscodeAPI}
                    />
                </TelemetryRecorderContext.Provider>
            </div>
        )
    }

    if (view === 'login' || !authStatus.isLoggedIn || !userAccountInfo) {
        return (
            <div className={styles.outerContainer}>
                <TelemetryRecorderContext.Provider value={telemetryRecorder}>
                    <LoginSimplified
                        simplifiedLoginRedirect={loginRedirect}
                        telemetryService={telemetryService}
                        uiKindIsWeb={config?.uiKindIsWeb}
                        vscodeAPI={vscodeAPI}
                    />
                </TelemetryRecorderContext.Provider>
            </div>
        )
    }

    return (
        <div className={styles.outerContainer}>
            {userHistory && <Notices probablyNewInstall={isNewInstall} vscodeAPI={vscodeAPI} />}
            {errorMessages && <ErrorBanner errors={errorMessages} setErrors={setErrorMessages} />}
            {view === 'chat' && userHistory && (
                <ChatModelContextProvider value={chatModelContext}>
                    <WithContextProviders>
                        <TelemetryRecorderContext.Provider value={telemetryRecorder}>
                            <ClientStateContextProvider value={clientState}>
                                <Chat
                                    chatEnabled={chatEnabled}
                                    userInfo={userAccountInfo}
                                    messageInProgress={messageInProgress}
                                    transcript={transcript}
                                    vscodeAPI={vscodeAPI}
                                    telemetryService={telemetryService}
                                    isTranscriptError={isTranscriptError}
                                    guardrails={attributionEnabled ? guardrails : undefined}
                                />
                            </ClientStateContextProvider>
                        </TelemetryRecorderContext.Provider>
                    </WithContextProviders>
                </ChatModelContextProvider>
            )}
        </div>
    )
}

const ErrorBanner: React.FunctionComponent<{ errors: string[]; setErrors: (errors: string[]) => void }> =
    ({ errors, setErrors }) => (
        <div className={styles.errorContainer}>
            {errors.map((error, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: error strings might not be unique, so we have no natural id
                <div key={i} className={styles.error}>
                    <span>{error}</span>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={() => setErrors(errors.filter(e => e !== error))}
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    )
