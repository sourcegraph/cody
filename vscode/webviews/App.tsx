import { useCallback, useEffect, useMemo, useState } from 'react'

import './App.css'

import { uniq, without } from 'lodash'

import { ChatContextStatus } from '@sourcegraph/cody-shared/src/chat/context'
import { CodyPrompt } from '@sourcegraph/cody-shared/src/chat/prompts'
import { ChatHistory, ChatMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { Configuration } from '@sourcegraph/cody-shared/src/configuration'

import { AuthStatus, defaultAuthStatus, LocalEnv } from '../src/chat/protocol'

import { Chat } from './Chat'
import { LoadingPage } from './LoadingPage'
import { Login } from './Login'
import { View } from './NavBar'
import { Notices } from './Notices'
import { Plugins } from './Plugins'
import { UserHistory } from './UserHistory'
import { createWebviewTelemetryService } from './utils/telemetry'
import type { VSCodeWrapper } from './utils/VSCodeApi'

export const App: React.FunctionComponent<{ vscodeAPI: VSCodeWrapper }> = ({ vscodeAPI }) => {
    const [config, setConfig] = useState<
        | (Pick<Configuration, 'debugEnable' | 'serverEndpoint' | 'pluginsEnabled' | 'pluginsDebugEnabled'> & LocalEnv)
        | null
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
    const [enabledPlugins, setEnabledPlugins] = useState<string[]>([])
    const [myPrompts, setMyPrompts] = useState<[string, CodyPrompt][] | null>(null)
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
                    case 'enabled-plugins':
                        setEnabledPlugins(message.plugins)
                        break
                    case 'custom-prompts':
                        setMyPrompts(message.prompts?.filter(command => command[1]?.slashCommand) || null)
                        break
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

    const onLoginRedirect = useCallback(
        (uri: string) => {
            setConfig(null)
            setEndpoint(null)
            setAuthStatus(defaultAuthStatus)
            setView('login')
            vscodeAPI.postMessage({ command: 'auth', type: 'callback', endpoint: uri })
        },
        [setEndpoint, vscodeAPI]
    )

    const onPluginToggle = useCallback(
        (pluginName: string, enabled: boolean) => {
            const newPlugins = enabled ? uniq([...enabledPlugins, pluginName]) : without(enabledPlugins, pluginName)
            vscodeAPI.postMessage({ command: 'setEnabledPlugins', plugins: newPlugins })
            setEnabledPlugins(newPlugins)
        },
        [enabledPlugins, vscodeAPI]
    )

    const telemetryService = useMemo(() => createWebviewTelemetryService(vscodeAPI), [vscodeAPI])

    if (!view || !authStatus || !config) {
        return <LoadingPage />
    }

    return (
        <div className="outer-container">
            {view === 'login' || !authStatus.isLoggedIn ? (
                <Login
                    authStatus={authStatus}
                    endpoint={endpoint}
                    isAppInstalled={isAppInstalled}
                    isAppRunning={config?.isAppRunning}
                    vscodeAPI={vscodeAPI}
                    telemetryService={telemetryService}
                    appOS={config?.os}
                    appArch={config?.arch}
                    uiKindIsWeb={config?.uiKindIsWeb}
                    callbackScheme={config?.uriScheme}
                    onLoginRedirect={onLoginRedirect}
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
                            serverEndpoint={endpoint || ''}
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
                            pluginsDevMode={Boolean(config?.pluginsDebugEnabled)}
                            setSuggestions={setSuggestions}
                            telemetryService={telemetryService}
                            chatCommands={myPrompts || undefined}
                            isTranscriptError={isTranscriptError}
                            showOnboardingButtons={userHistory && Object.entries(userHistory).length === 0}
                        />
                    )}
                </>
            )}

            {config.pluginsEnabled && view === 'plugins' && (
                <Plugins plugins={enabledPlugins} onPluginToggle={onPluginToggle} />
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
