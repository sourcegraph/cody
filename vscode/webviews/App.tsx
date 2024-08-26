import { type ComponentProps, useCallback, useEffect, useMemo, useState } from 'react'

import styles from './App.module.css'

import {
    type ChatMessage,
    type ClientStateForWebview,
    CodyIDE,
    GuardrailsPost,
    type Model,
    PromptString,
    type SerializedChatTranscript,
    type TelemetryRecorder,
} from '@sourcegraph/cody-shared'
import type { AuthMethod } from '../src/chat/protocol'
import { LoadingPage } from './LoadingPage'
import { LoginSimplified } from './OnboardingExperiment'
import { ConnectionIssuesPage } from './Troubleshooting'
import { type ChatModelContext, ChatModelContextProvider } from './chat/models/chatModelContext'
import { useClientActionDispatcher } from './client/clientState'

import {
    ClientStateContextProvider,
    ExtensionAPIProviderFromVSCodeAPI,
} from '@sourcegraph/prompt-editor'
import { CodyPanel } from './CodyPanel'
import { ChatEnvironmentContext, type ChatEnvironmentContextData } from './chat/ChatEnvironmentContext'
import { View } from './tabs'
import type { VSCodeWrapper } from './utils/VSCodeApi'
import { ComposedWrappers, type Wrapper } from './utils/composeWrappers'
import { updateDisplayPathEnvInfoForWebview } from './utils/displayPathEnvInfo'
import { TelemetryRecorderContext, createWebviewTelemetryRecorder } from './utils/telemetry'
import { type Config, ConfigProvider } from './utils/useConfig'

export const App: React.FunctionComponent<{ vscodeAPI: VSCodeWrapper }> = ({ vscodeAPI }) => {
    const [config, setConfig] = useState<Config | null>(null)
    // NOTE: View state will be set by the extension host during initialization.
    const [view, setView] = useState<View>()
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)

    const [transcript, setTranscript] = useState<ChatMessage[]>([])

    const [userHistory, setUserHistory] = useState<SerializedChatTranscript[]>()

    const [errorMessages, setErrorMessages] = useState<string[]>([])
    const [isTranscriptError, setIsTranscriptError] = useState<boolean>(false)

    const [chatModels, setChatModels] = useState<Model[]>()

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
                    case 'ui/theme': {
                        document.documentElement.dataset.ide = message.agentIDE
                        const rootStyle = document.documentElement.style
                        for (const [name, value] of Object.entries(message.cssVariables || {})) {
                            rootStyle.setProperty(name, value)
                        }
                        break
                    }
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
                        vscodeAPI.setState(message.chatID)
                        break
                    }
                    case 'config':
                        setConfig(message)
                        updateDisplayPathEnvInfoForWebview(message.workspaceFolderUris)
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
                        setErrorMessages(prev => [...prev, message.errors].slice(-5))
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
        [view, vscodeAPI, guardrails, dispatchClientAction]
    )

    useEffect(() => {
        // On macOS, suppress the '¬' character emitted by default for alt+L
        const handleKeyDown = (event: KeyboardEvent) => {
            const suppressedKeys = ['¬', 'Ò', '¿', '÷']
            if (event.altKey && suppressedKeys.includes(event.key)) {
                event.preventDefault()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [])

    useEffect(() => {
        // Notify the extension host that we are ready to receive events
        vscodeAPI.postMessage({ command: 'ready' })
    }, [vscodeAPI])

    useEffect(() => {
        if (!view) {
            vscodeAPI.postMessage({ command: 'initialized' })
            return
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

    // V2 telemetry recorder
    const telemetryRecorder = useMemo(() => createWebviewTelemetryRecorder(vscodeAPI), [vscodeAPI])

    const onCurrentChatModelChange = useCallback(
        (selected: Model): void => {
            vscodeAPI.postMessage({
                command: 'chatModel',
                model: selected.id,
            })
        },
        [vscodeAPI]
    )
    const chatModelContext = useMemo<ChatModelContext>(
        () => ({
            chatModels,
            onCurrentChatModelChange,
            serverSentModelsEnabled: config?.configFeatures.serverSentModels,
        }),
        [chatModels, onCurrentChatModelChange, config]
    )
    const chatEnvironmentContext = useMemo<ChatEnvironmentContextData>(() => {
        return { clientType: config?.config?.agentIDE ?? CodyIDE.VSCode }
    }, [config?.config?.agentIDE])

    const wrappers = useMemo<Wrapper[]>(
        () =>
            getAppWrappers(
                vscodeAPI,
                telemetryRecorder,
                chatModelContext,
                clientState,
                config,
                chatEnvironmentContext
            ),
        [vscodeAPI, telemetryRecorder, chatModelContext, clientState, config, chatEnvironmentContext]
    )

    // Wait for all the data to be loaded before rendering Chat View
    if (!view || !config || !userHistory) {
        return <LoadingPage />
    }

    return (
        <ComposedWrappers wrappers={wrappers}>
            {config.authStatus.showNetworkError ? (
                <div className={styles.outerContainer}>
                    <ConnectionIssuesPage
                        configuredEndpoint={config.authStatus.endpoint}
                        vscodeAPI={vscodeAPI}
                    />
                </div>
            ) : view === View.Login || !config.authStatus.isLoggedIn ? (
                <div className={styles.outerContainer}>
                    <LoginSimplified
                        simplifiedLoginRedirect={loginRedirect}
                        uiKindIsWeb={config.config.uiKindIsWeb}
                        vscodeAPI={vscodeAPI}
                        codyIDE={config.config.agentIDE ?? CodyIDE.VSCode}
                    />
                </div>
            ) : (
                <CodyPanel
                    view={view}
                    setView={setView}
                    config={config.config}
                    errorMessages={errorMessages}
                    setErrorMessages={setErrorMessages}
                    attributionEnabled={config.configFeatures.attribution}
                    chatEnabled={config.configFeatures.chat}
                    messageInProgress={messageInProgress}
                    transcript={transcript}
                    vscodeAPI={vscodeAPI}
                    isTranscriptError={isTranscriptError}
                    guardrails={guardrails}
                    userHistory={userHistory}
                    smartApplyEnabled={config.config.smartApply}
                />
            )}
        </ComposedWrappers>
    )
}

export function getAppWrappers(
    vscodeAPI: VSCodeWrapper,
    telemetryRecorder: TelemetryRecorder,
    chatModelContext: ChatModelContext,
    clientState: ClientStateForWebview,
    config: Config | null,
    chatEnvironmentContext: ChatEnvironmentContextData
): Wrapper[] {
    return [
        {
            provider: TelemetryRecorderContext.Provider,
            value: telemetryRecorder,
        } satisfies Wrapper<ComponentProps<typeof TelemetryRecorderContext.Provider>['value']>,
        {
            component: ExtensionAPIProviderFromVSCodeAPI,
            props: { vscodeAPI },
        } satisfies Wrapper<any, ComponentProps<typeof ExtensionAPIProviderFromVSCodeAPI>>,
        {
            provider: ChatModelContextProvider,
            value: chatModelContext,
        } satisfies Wrapper<ComponentProps<typeof ChatModelContextProvider>['value']>,
        {
            provider: ClientStateContextProvider,
            value: clientState,
        } satisfies Wrapper<ComponentProps<typeof ClientStateContextProvider>['value']>,
        {
            component: ConfigProvider,
            props: { value: config },
        } satisfies Wrapper<any, ComponentProps<typeof ConfigProvider>>,
        {
            provider: ChatEnvironmentContext.Provider,
            value: chatEnvironmentContext,
        } satisfies Wrapper<ComponentProps<typeof ChatEnvironmentContext.Provider>['value']>,
    ]
}
