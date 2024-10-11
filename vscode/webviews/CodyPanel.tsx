import { type AuthStatus, type ClientCapabilities, CodyIDE } from '@sourcegraph/cody-shared'
import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import type React from 'react'
import { type ComponentProps, type FunctionComponent, useMemo, useRef } from 'react'
import type { ConfigurationSubsetForWebview, LocalEnv } from '../src/chat/protocol'
import styles from './App.module.css'
import { Chat } from './Chat'
import { ConnectivityStatusBanner } from './components/ConnectivityStatusBanner'
import { Notices } from './components/Notices'
import { StateDebugOverlay } from './components/StateDebugOverlay'
import { TabContainer, TabRoot } from './components/shadcn/ui/tabs'
import { AccountTab, HistoryTab, PromptsTab, SettingsTab, TabsBar, View } from './tabs'
import { TabViewContext } from './utils/useTabView'

/**
 * The Cody tab panel, with tabs for chat, history, prompts, etc.
 */
export const CodyPanel: FunctionComponent<
    {
        view: View
        setView: (view: View) => void
        configuration: {
            config: LocalEnv & ConfigurationSubsetForWebview
            clientCapabilities: ClientCapabilities
            authStatus: AuthStatus
        }
        errorMessages: string[]
        setErrorMessages: (errors: string[]) => void
        attributionEnabled: boolean
    } & Pick<
        ComponentProps<typeof Chat>,
        | 'chatEnabled'
        | 'messageInProgress'
        | 'transcript'
        | 'vscodeAPI'
        | 'guardrails'
        | 'showWelcomeMessage'
        | 'showIDESnippetActions'
        | 'smartApplyEnabled'
    >
> = ({
    view,
    setView,
    configuration: { config, clientCapabilities, authStatus },
    errorMessages,
    setErrorMessages,
    attributionEnabled,
    chatEnabled,
    messageInProgress,
    transcript,
    vscodeAPI,
    guardrails,
    showIDESnippetActions,
    showWelcomeMessage,
    smartApplyEnabled,
}) => {
    const tabContainerRef = useRef<HTMLDivElement>(null)

    const api = useExtensionAPI()
    const { value: chatModels } = useObservable(useMemo(() => api.chatModels(), [api.chatModels]))

    return (
        <TabViewContext.Provider value={useMemo(() => ({ view, setView }), [view, setView])}>
            <TabRoot
                defaultValue={View.Chat}
                value={view}
                orientation="vertical"
                className={styles.outerContainer}
            >
                {!authStatus.authenticated && authStatus.showNetworkError && (
                    <ConnectivityStatusBanner />
                )}

                {/* Hide tab bar in editor chat panels. */}
                {(clientCapabilities.agentIDE === CodyIDE.Web || config.webviewType !== 'editor') && (
                    <TabsBar currentView={view} setView={setView} IDE={clientCapabilities.agentIDE} />
                )}
                {errorMessages && <ErrorBanner errors={errorMessages} setErrors={setErrorMessages} />}
                <Notices />
                <TabContainer value={view} ref={tabContainerRef}>
                    {view === View.Chat && (
                        <Chat
                            chatEnabled={chatEnabled}
                            messageInProgress={messageInProgress}
                            transcript={transcript}
                            models={chatModels || []}
                            vscodeAPI={vscodeAPI}
                            guardrails={attributionEnabled ? guardrails : undefined}
                            showIDESnippetActions={showIDESnippetActions}
                            showWelcomeMessage={showWelcomeMessage}
                            scrollableParent={tabContainerRef.current}
                            smartApplyEnabled={smartApplyEnabled}
                            setView={setView}
                        />
                    )}
                    {view === View.History && (
                        <HistoryTab
                            IDE={clientCapabilities.agentIDE}
                            setView={setView}
                            webviewType={config.webviewType}
                            multipleWebviewsEnabled={config.multipleWebviewsEnabled}
                        />
                    )}
                    {view === View.Prompts && <PromptsTab setView={setView} />}
                    {view === View.Account && <AccountTab setView={setView} />}
                    {view === View.Settings && <SettingsTab />}
                </TabContainer>
                <StateDebugOverlay />
            </TabRoot>
        </TabViewContext.Provider>
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
