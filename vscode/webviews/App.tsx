import { type ComponentProps, useCallback, useEffect, useMemo, useState } from 'react'

import styles from './App.module.css'

import {
    type ChatMessage,
    type ContextItem,
    GuardrailsPost,
    PromptString,
    type TelemetryRecorder,
} from '@sourcegraph/cody-shared'
import type { AuthMethod } from '../src/chat/protocol'
import { AuthPage } from './AuthPage'
import { LoadingPage } from './LoadingPage'
import { useClientActionDispatcher } from './client/clientState'

import { ExtensionAPIProviderFromVSCodeAPI } from '@sourcegraph/prompt-editor'
import { CodyPanel } from './CodyPanel'
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

    const [errorMessages, setErrorMessages] = useState<string[]>([])

    const dispatchClientAction = useClientActionDispatcher()

    const guardrails = useMemo(() => {
        return new GuardrailsPost((snippet: string) => {
            vscodeAPI.postMessage({
                command: 'attribution-search',
                snippet,
            })
        })
    }, [vscodeAPI])

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
                        // Reset to the default view (Chat) for unauthenticated users.
                        if (view && view !== View.Chat && !message.authStatus?.authenticated) {
                            setView(View.Chat)
                        }
                        break
                    case 'clientAction':
                        dispatchClientAction(message)
                        break
                    case 'errors':
                        setErrorMessages(prev => [...prev, message.errors].slice(-5))
                        break
                    case 'view':
                        setView(message.view)
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

    const wrappers = useMemo<Wrapper[]>(
        () => getAppWrappers(vscodeAPI, telemetryRecorder, config, undefined),
        [vscodeAPI, telemetryRecorder, config]
    )

    // Wait for all the data to be loaded before rendering Chat View
    if (!view || !config) {
        return <LoadingPage />
    }

    return (
        <ComposedWrappers wrappers={wrappers}>
            {view === View.Login || !config.authStatus.authenticated ? (
                <div className={styles.outerContainer}>
                    <AuthPage
                        simplifiedLoginRedirect={loginRedirect}
                        uiKindIsWeb={config.config.uiKindIsWeb}
                        vscodeAPI={vscodeAPI}
                        codyIDE={config.clientCapabilities.agentIDE}
                    />
                </div>
            ) : (
                <CodyPanel
                    view={view}
                    setView={setView}
                    configuration={config}
                    errorMessages={errorMessages}
                    setErrorMessages={setErrorMessages}
                    attributionEnabled={config.configFeatures.attribution}
                    chatEnabled={config.configFeatures.chat}
                    messageInProgress={messageInProgress}
                    transcript={transcript}
                    vscodeAPI={vscodeAPI}
                    guardrails={guardrails}
                    smartApplyEnabled={config.config.smartApply}
                />
            )}
        </ComposedWrappers>
    )
}

export function getAppWrappers(
    vscodeAPI: VSCodeWrapper,
    telemetryRecorder: TelemetryRecorder,
    config: Config | null,
    staticInitialContext: ContextItem[] | undefined
): Wrapper[] {
    return [
        {
            provider: TelemetryRecorderContext.Provider,
            value: telemetryRecorder,
        } satisfies Wrapper<ComponentProps<typeof TelemetryRecorderContext.Provider>['value']>,
        {
            component: ExtensionAPIProviderFromVSCodeAPI,
            props: { vscodeAPI, staticInitialContext },
        } satisfies Wrapper<any, ComponentProps<typeof ExtensionAPIProviderFromVSCodeAPI>>,
        {
            component: ConfigProvider,
            props: { value: config },
        } satisfies Wrapper<any, ComponentProps<typeof ConfigProvider>>,
    ]
}
