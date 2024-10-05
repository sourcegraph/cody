import { type ComponentProps, type FunctionComponent, useEffect, useMemo, useState } from 'react'

import styles from './App.module.css'

import {
    type ChatMessage,
    type ContextItem,
    GuardrailsPost,
    PromptString,
} from '@sourcegraph/cody-shared'
import type { AuthMethod } from '../src/chat/protocol'
import { AuthPage } from './AuthPage'
import { LoadingPage } from './LoadingPage'
import { useClientActionDispatcher } from './client/clientState'

import { ExtensionAPIProviderFromVSCodeAPI } from '@sourcegraph/prompt-editor'
import { CodyPanel } from './CodyPanel'
import { View } from './tabs'
import { type VSCodeWrapper, getVSCodeAPI } from './utils/VSCodeApi'
import { ComposedWrappers, type Wrapper } from './utils/composeWrappers'
import { TelemetryRecorderContext, createWebviewTelemetryRecorder } from './utils/telemetry'
import { LegacyWebviewConfigProvider, useLegacyWebviewConfig } from './utils/useLegacyWebviewConfig'

export const App: React.FunctionComponent<{ vscodeAPI: VSCodeWrapper }> = ({ vscodeAPI }) => {
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
                }
            }),
        [vscodeAPI]
    )

    const [view, setView] = useState<View>(View.Chat)

    const wrappers = useMemo<Wrapper[]>(() => getAppWrappers(vscodeAPI, undefined), [vscodeAPI])

    // Wait for all the data to be loaded before rendering Chat View
    if (!view) {
        return <LoadingPage />
    }

    return (
        <ComposedWrappers wrappers={wrappers}>
            <LoginOrPanel vscodeAPI={vscodeAPI} view={view} setView={setView} />
        </ComposedWrappers>
    )
}

export function getAppWrappers(
    vscodeAPI: VSCodeWrapper,
    staticInitialContext: ContextItem[] | undefined
): Wrapper[] {
    const telemetryRecorder = createWebviewTelemetryRecorder(vscodeAPI)
    return [
        {
            provider: TelemetryRecorderContext.Provider,
            value: telemetryRecorder,
        } satisfies Wrapper<ComponentProps<typeof TelemetryRecorderContext.Provider>['value']>,
        {
            component: LegacyWebviewConfigProvider,
        } satisfies Wrapper<never, ComponentProps<typeof LegacyWebviewConfigProvider>>,
        {
            component: ExtensionAPIProviderFromVSCodeAPI,
            props: { vscodeAPI, staticInitialContext },
        } satisfies Wrapper<any, ComponentProps<typeof ExtensionAPIProviderFromVSCodeAPI>>,
    ]
}

const LoginOrPanel: FunctionComponent<{
    vscodeAPI: VSCodeWrapper

    view: View
    setView: (view: View) => void
}> = ({ vscodeAPI, view, setView }) => {
    const legacyConfig = useLegacyWebviewConfig()

    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    const [transcript, setTranscript] = useState<ChatMessage[]>()
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
        [vscodeAPI, setView, guardrails, dispatchClientAction]
    )

    useEffect(() => {
        vscodeAPI.postMessage({ command: 'initialized' })
    }, [vscodeAPI])

    return view === View.Login || !legacyConfig.authStatus.authenticated ? (
        <div className={styles.outerContainer}>
            <AuthPage
                simplifiedLoginRedirect={loginRedirect}
                uiKindIsWeb={legacyConfig.config.uiKindIsWeb}
                vscodeAPI={vscodeAPI}
            />
        </div>
    ) : (
        <CodyPanel
            view={view}
            setView={setView}
            errorMessages={errorMessages}
            setErrorMessages={setErrorMessages}
            attributionEnabled={legacyConfig.configFeatures.attribution}
            chatEnabled={legacyConfig.configFeatures.chat}
            messageInProgress={messageInProgress}
            transcript={transcript ?? null}
            vscodeAPI={vscodeAPI}
            guardrails={guardrails}
            smartApplyEnabled={legacyConfig.config.smartApply}
        />
    )
}

function loginRedirect(method: AuthMethod) {
    // We do not change the view here. We want to keep presenting the
    // login buttons until we get a token so users don't get stuck if
    // they close the browser during an auth flow.
    getVSCodeAPI().postMessage({
        command: 'auth',
        authKind: 'simplified-onboarding',
        authMethod: method,
    })
}
