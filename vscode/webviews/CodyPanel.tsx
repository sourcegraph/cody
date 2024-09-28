import { type ChatMessage, CodyIDE, PromptString } from '@sourcegraph/cody-shared'
import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import clsx from 'clsx'
import type React from 'react'
import { type ComponentProps, type FunctionComponent, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthMethod } from '../src/chat/protocol'
import { AuthPage } from './AuthPage'
import { Chat } from './Chat'
import styles from './CodyPanel.module.css'
import { useClientActionDispatcher } from './client/clientState'
import { ConnectivityStatusBanner } from './components/ConnectivityStatusBanner'
import { Notices } from './components/Notices'
import { StateDebugOverlay } from './components/StateDebugOverlay'
import { TabContainer, TabRoot } from './components/shadcn/ui/tabs'
import { AccountTab, HistoryTab, PromptsTab, SettingsTab, TabsBar, View } from './tabs'
import { type VSCodeWrapper, getVSCodeAPI } from './utils/VSCodeApi'
import { useLegacyWebviewConfig } from './utils/useLegacyWebviewConfig'
import { TabViewContext } from './utils/useTabView'

/**
 * The Cody tab panel, with tabs for chat, history, prompts, etc.
 */
export const CodyPanel: FunctionComponent<
    {
        view: View
        setView: (view: View) => void
        vscodeAPI: VSCodeWrapper
        'data-cody-web-chat'?: true
    } & Pick<
        ComponentProps<typeof Chat>,
        'vscodeAPI' | 'showWelcomeMessage' | 'showIDESnippetActions' | 'smartApplyEnabled'
    >
> = ({
    view,
    setView,
    vscodeAPI,
    showIDESnippetActions,
    showWelcomeMessage,
    smartApplyEnabled,
    'data-cody-web-chat': dataCodyWebChat,
}) => {
    const legacyConfig = useLegacyWebviewConfig()
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    const [transcript, setTranscript] = useState<ChatMessage[]>([])
    const [errorMessages, setErrorMessages] = useState<string[]>([])
    const dispatchClientAction = useClientActionDispatcher()

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

                        // Save state for deserialization later in VS Code's
                        // `deserializeWebviewPanel` hook.
                        if (legacyConfig.config.agentIDE !== CodyIDE.Web) {
                            vscodeAPI.setState(message.chatID)
                        }
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
                }
            }),
        [vscodeAPI, setView, dispatchClientAction, legacyConfig.config.agentIDE]
    )

    return (
        <CodyPanelWithData
            view={view}
            setView={setView}
            vscodeAPI={vscodeAPI}
            errorMessages={errorMessages}
            setErrorMessages={setErrorMessages}
            transcript={transcript}
            messageInProgress={messageInProgress}
            showIDESnippetActions={showIDESnippetActions}
            showWelcomeMessage={showWelcomeMessage}
            smartApplyEnabled={smartApplyEnabled}
            data-cody-web-chat={dataCodyWebChat}
        />
    )
}

export const CodyPanelWithData: FunctionComponent<
    {
        view: View
        setView: (view: View) => void
        errorMessages: string[]
        setErrorMessages: (messages: string[]) => void
        'data-cody-web-chat'?: true
    } & Pick<
        ComponentProps<typeof Chat>,
        | 'transcript'
        | 'messageInProgress'
        | 'vscodeAPI'
        | 'showWelcomeMessage'
        | 'showIDESnippetActions'
        | 'smartApplyEnabled'
    >
> = ({
    view,
    setView,
    vscodeAPI,
    errorMessages,
    setErrorMessages,
    transcript,
    messageInProgress,
    showIDESnippetActions,
    showWelcomeMessage,
    smartApplyEnabled,
    'data-cody-web-chat': dataCodyWebChat,
}) => {
    const tabContainerRef = useRef<HTMLDivElement>(null)
    const tabViewValue = useMemo(() => ({ view, setView }), [view, setView])

    const api = useExtensionAPI()
    const { value: chatModels } = useObservable(useMemo(() => api.chatModels(), [api.chatModels]))
    const { config, clientCapabilities, authStatus } = useLegacyWebviewConfig()

    const connectivityStatus = !authStatus.authenticated && authStatus.showNetworkError && (
        <ConnectivityStatusBanner />
    )

    return (
        <div className={clsx(styles.root, 'tw-flex tw-flex-col')} data-cody-web-chat={dataCodyWebChat}>
            {view === View.Login || !authStatus.authenticated ? (
                <>
                    {connectivityStatus}
                    <AuthPage
                        simplifiedLoginRedirect={loginRedirect}
                        uiKindIsWeb={config.uiKindIsWeb}
                        vscodeAPI={vscodeAPI}
                    />
                </>
            ) : (
                <TabViewContext.Provider value={tabViewValue}>
                    <TabRoot
                        defaultValue={View.Chat}
                        value={view}
                        orientation="vertical"
                        className={styles.outerContainer}
                    >
                        {connectivityStatus}

                        {/* Hide tab bar in editor chat panels. */}
                        {(clientCapabilities.agentIDE === CodyIDE.Web ||
                            config.webviewType !== 'editor') && (
                            <TabsBar
                                currentView={view}
                                setView={setView}
                                IDE={clientCapabilities.agentIDE}
                            />
                        )}
                        {errorMessages && (
                            <ErrorBanner errors={errorMessages} setErrors={setErrorMessages} />
                        )}
                        <Notices />
                        <TabContainer value={view} ref={tabContainerRef}>
                            {view === View.Chat && (
                                <Chat
                                    messageInProgress={messageInProgress}
                                    transcript={transcript}
                                    models={chatModels || []}
                                    vscodeAPI={vscodeAPI}
                                    showIDESnippetActions={showIDESnippetActions}
                                    showWelcomeMessage={showWelcomeMessage}
                                    scrollableParent={tabContainerRef.current}
                                    smartApplyEnabled={smartApplyEnabled}
                                    setView={setView}
                                />
                            )}
                            {view === View.History && (
                                <HistoryTab
                                    IDE={config.agentIDE || CodyIDE.VSCode}
                                    setView={setView}
                                    webviewType={config.webviewType}
                                    multipleWebviewsEnabled={config.multipleWebviewsEnabled}
                                />
                            )}
                            {view === View.Prompts && <PromptsTab setView={setView} />}
                            {view === View.Account && <AccountTab setView={setView} />}
                            {view === View.Settings && <SettingsTab />}
                        </TabContainer>
                    </TabRoot>
                </TabViewContext.Provider>
            )}
            <StateDebugOverlay />
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

function loginRedirect(method: AuthMethod): void {
    // We do not change the view here. We want to keep presenting the
    // login buttons until we get a token so users don't get stuck if
    // they close the browser during an auth flow.
    getVSCodeAPI().postMessage({
        command: 'auth',
        authKind: 'simplified-onboarding',
        authMethod: method,
    })
}
