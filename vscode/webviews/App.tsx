import { type ComponentProps, useCallback, useEffect, useMemo, useState } from 'react'

import styles from './App.module.css'

import {
    type AuthStatus,
    type ChatMessage,
    type ClientStateForWebview,
    type CodyCommand,
    CodyIDE,
    GuardrailsPost,
    type Model,
    PromptString,
    type SerializedChatTranscript,
    type TelemetryRecorder,
    isCodyProUser,
} from '@sourcegraph/cody-shared'
import type { AuthMethod, ConfigurationSubsetForWebview, LocalEnv } from '../src/chat/protocol'
import type { UserAccountInfo } from './Chat'
import { Chat } from './Chat'
import { LoadingPage } from './LoadingPage'
import { LoginSimplified } from './OnboardingExperiment'
import { ConnectionIssuesPage } from './Troubleshooting'
import { type ChatModelContext, ChatModelContextProvider } from './chat/models/chatModelContext'
import { useClientActionDispatcher } from './client/clientState'

import { ClientStateContextProvider } from '@sourcegraph/prompt-editor'
import { PromptsClientProviderFromVSCodeAPI } from './components/promptSelectField/promptsClient'
import { TabContainer, TabRoot } from './components/shadcn/ui/tabs'
import { ChatContextClientProviderFromVSCodeAPI } from './openctxClient'
import { AccountTab, CommandsTab, HistoryTab, SettingsTab, TabsBar, View } from './tabs'
import type { VSCodeWrapper } from './utils/VSCodeApi'
import { ComposedWrappers, type Wrapper } from './utils/composeWrappers'
import { updateDisplayPathEnvInfoForWebview } from './utils/displayPathEnvInfo'
import { TelemetryRecorderContext, createWebviewTelemetryRecorder } from './utils/telemetry'
import { type Config, ConfigProvider } from './utils/useConfig'
import { FeatureFlagsProvider } from './utils/useFeatureFlags'

export const App: React.FunctionComponent<{ vscodeAPI: VSCodeWrapper }> = ({ vscodeAPI }) => {
    const [config, setConfig] = useState<(LocalEnv & ConfigurationSubsetForWebview) | null>(null)
    const [view, setView] = useState<View | undefined>()
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)

    const [transcript, setTranscript] = useState<ChatMessage[]>([])

    const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
    const [userAccountInfo, setUserAccountInfo] = useState<UserAccountInfo>()

    const [userHistory, setUserHistory] = useState<SerializedChatTranscript[]>()
    const [chatID, setChatID] = useState<string>('[no-chat]')

    const [errorMessages, setErrorMessages] = useState<string[]>([])
    const [isTranscriptError, setIsTranscriptError] = useState<boolean>(false)

    const [chatModels, setChatModels] = useState<Model[]>()

    const [chatEnabled, setChatEnabled] = useState<boolean>(true)
    const [attributionEnabled, setAttributionEnabled] = useState<boolean>(false)
    const [commandList, setCommandList] = useState<CodyCommand[]>([])
    const [serverSentModelsEnabled, setServerSentModelsEnabled] = useState<boolean>(false)
    const [exportedFeatureFlags, setExportedFeatureFlags] = useState<Record<string, boolean>>()

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
                        setChatID(message.chatID)
                        vscodeAPI.setState(message.chatID)
                        break
                    }
                    case 'config':
                        setConfig(message.config)
                        setAuthStatus(message.authStatus)
                        setUserAccountInfo({
                            isCodyProUser: isCodyProUser(message.authStatus),
                            // Receive this value from the extension backend to make it work
                            // with E2E tests where change the DOTCOM_URL via the env variable TESTING_DOTCOM_URL.
                            isDotComUser: message.authStatus.isDotCom,
                            user: message.authStatus,
                            ide: message.config.agentIDE ?? CodyIDE.VSCode,
                        })
                        setView(message.authStatus.isLoggedIn ? View.Chat : View.Login)
                        updateDisplayPathEnvInfoForWebview(message.workspaceFolderUris)
                        // Get chat models
                        if (message.authStatus.isLoggedIn) {
                            vscodeAPI.postMessage({ command: 'get-chat-models' })
                        }
                        break
                    case 'setConfigFeatures':
                        setExportedFeatureFlags(message.exportedFeatureFlags)
                        setChatEnabled(message.configFeatures.chat)
                        setAttributionEnabled(message.configFeatures.attribution)
                        setServerSentModelsEnabled(message.configFeatures.serverSentModels)
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
                    case 'commands':
                        setCommandList(message.commands)
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
        // On macOS, suppress the '¬' character emitted by default for alt+L
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.altKey && event.key === '¬') {
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
                model: selected.model,
            })
        },
        [vscodeAPI]
    )
    const chatModelContext = useMemo<ChatModelContext>(
        () => ({ chatModels, onCurrentChatModelChange, serverSentModelsEnabled }),
        [chatModels, onCurrentChatModelChange, serverSentModelsEnabled]
    )

    const wrappers = useMemo<Wrapper[]>(
        () =>
            getAppWrappers(
                vscodeAPI,
                telemetryRecorder,
                chatModelContext,
                clientState,
                exportedFeatureFlags,
                config && authStatus ? { config, authStatus } : undefined
            ),
        [
            vscodeAPI,
            telemetryRecorder,
            chatModelContext,
            clientState,
            exportedFeatureFlags,
            config,
            authStatus,
        ]
    )

    // Wait for all the data to be loaded before rendering Chat View
    if (!view || !authStatus || !config || !userHistory) {
        return <LoadingPage />
    }

    return (
        <ComposedWrappers wrappers={wrappers}>
            {authStatus.showNetworkError ? (
                <div className={styles.outerContainer}>
                    <ConnectionIssuesPage
                        configuredEndpoint={authStatus.endpoint}
                        vscodeAPI={vscodeAPI}
                    />
                </div>
            ) : view === 'login' || !authStatus.isLoggedIn || !userAccountInfo ? (
                <div className={styles.outerContainer}>
                    <LoginSimplified
                        simplifiedLoginRedirect={loginRedirect}
                        uiKindIsWeb={config.uiKindIsWeb}
                        vscodeAPI={vscodeAPI}
                    />
                </div>
            ) : (
                <TabRoot
                    defaultValue={View.Chat}
                    value={view}
                    orientation="vertical"
                    className={styles.outerContainer}
                >
                    {/* NOTE: Display tabs to PLG users only until Universal Cody is ready. */}
                    {/* Shows tab bar for sidebar chats only. */}
                    {userAccountInfo.isDotComUser && config.webviewType === 'editor' ? null : (
                        <TabsBar
                            currentView={view}
                            setView={setView}
                            IDE={config.agentIDE || CodyIDE.VSCode}
                        />
                    )}
                    {errorMessages && (
                        <ErrorBanner errors={errorMessages} setErrors={setErrorMessages} />
                    )}
                    <TabContainer value={view}>
                        {view === 'chat' && (
                            <Chat
                                chatID={chatID}
                                chatEnabled={chatEnabled}
                                userInfo={userAccountInfo}
                                messageInProgress={messageInProgress}
                                transcript={transcript}
                                vscodeAPI={vscodeAPI}
                                isTranscriptError={isTranscriptError}
                                guardrails={attributionEnabled ? guardrails : undefined}
                                experimentalUnitTestEnabled={config.experimentalUnitTest}
                            />
                        )}
                        {view === 'history' && <HistoryTab userHistory={userHistory} />}
                        {view === 'commands' && (
                            <CommandsTab
                                setView={setView}
                                IDE={config.agentIDE}
                                commands={commandList}
                            />
                        )}
                        {view === 'account' && <AccountTab userInfo={userAccountInfo} />}
                        {view === 'settings' && <SettingsTab userInfo={userAccountInfo} />}
                    </TabContainer>
                </TabRoot>
            )}
        </ComposedWrappers>
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

export function getAppWrappers(
    vscodeAPI: VSCodeWrapper,
    telemetryRecorder: TelemetryRecorder,
    chatModelContext: ChatModelContext,
    clientState: ClientStateForWebview,
    exportedFeatureFlags: Record<string, boolean> | undefined,
    config: Config | undefined
): Wrapper[] {
    return [
        {
            component: ChatContextClientProviderFromVSCodeAPI,
            props: { vscodeAPI },
        } satisfies Wrapper<any, ComponentProps<typeof ChatContextClientProviderFromVSCodeAPI>>,
        {
            provider: TelemetryRecorderContext.Provider,
            value: telemetryRecorder,
        } satisfies Wrapper<ComponentProps<typeof TelemetryRecorderContext.Provider>['value']>,
        {
            provider: ChatModelContextProvider,
            value: chatModelContext,
        } satisfies Wrapper<ComponentProps<typeof ChatModelContextProvider>['value']>,
        {
            provider: ClientStateContextProvider,
            value: clientState,
        } satisfies Wrapper<ComponentProps<typeof ClientStateContextProvider>['value']>,
        {
            component: FeatureFlagsProvider,
            props: { value: exportedFeatureFlags },
        } satisfies Wrapper<any, ComponentProps<typeof FeatureFlagsProvider>>,
        {
            component: ConfigProvider,
            props: { value: config },
        } satisfies Wrapper<any, ComponentProps<typeof ConfigProvider>>,
        {
            component: PromptsClientProviderFromVSCodeAPI,
            props: { vscodeAPI },
        } satisfies Wrapper<any, ComponentProps<typeof PromptsClientProviderFromVSCodeAPI>>,
    ]
}
