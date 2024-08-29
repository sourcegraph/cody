import { type AuthStatus, CodyIDE } from '@sourcegraph/cody-shared'
import type React from 'react'
import { type ComponentProps, type FunctionComponent, useCallback, useRef } from 'react'
import type { ConfigurationSubsetForWebview, LocalEnv } from '../src/chat/protocol'
import styles from './App.module.css'
import { Chat } from './Chat'
import { ConnectivityStatusBanner } from './components/ConnectivityStatusBanner'
import { TabContainer, TabRoot } from './components/shadcn/ui/tabs'
import { AccountTab, HistoryTab, PromptsTab, SettingsTab, TabsBar, View } from './tabs'

/**
 * The Cody tab panel, with tabs for chat, history, prompts, etc.
 */
export const CodyPanel: FunctionComponent<
    {
        view: View
        setView: (view: View) => void
        configuration: { config: LocalEnv & ConfigurationSubsetForWebview; authStatus: AuthStatus }
        errorMessages: string[]
        setErrorMessages: (errors: string[]) => void
        attributionEnabled: boolean
    } & Pick<
        ComponentProps<typeof Chat>,
        | 'chatEnabled'
        | 'messageInProgress'
        | 'transcript'
        | 'vscodeAPI'
        | 'isTranscriptError'
        | 'guardrails'
        | 'showWelcomeMessage'
        | 'showIDESnippetActions'
        | 'smartApplyEnabled'
        | 'experimentalOneBoxEnabled'
    > &
        Pick<ComponentProps<typeof HistoryTab>, 'userHistory'>
> = ({
    view,
    setView,
    configuration: { config, authStatus },
    errorMessages,
    setErrorMessages,
    attributionEnabled,
    chatEnabled,
    messageInProgress,
    transcript,
    vscodeAPI,
    isTranscriptError,
    guardrails,
    showIDESnippetActions,
    showWelcomeMessage,
    userHistory,
    smartApplyEnabled,
    experimentalOneBoxEnabled,
}) => {
    const tabContainerRef = useRef<HTMLDivElement>(null)

    // Use native browser download dialog to download chat history as a JSON file.
    const onDownloadChatClick = useCallback(() => {
        const json = JSON.stringify(userHistory, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5) // Format: YYYY-MM-DDTHH-mm
        const a = document.createElement('a') // a temporary anchor element
        a.href = url
        a.download = `cody-chat-history-${timestamp}.json`
        a.target = '_blank'
        a.click()
    }, [userHistory])

    return (
        <TabRoot
            defaultValue={View.Chat}
            value={view}
            orientation="vertical"
            className={styles.outerContainer}
        >
            {!authStatus.authenticated && authStatus.showNetworkError && <ConnectivityStatusBanner />}

            {/* Hide tab bar in editor chat panels. */}
            {(config.agentIDE === CodyIDE.Web || config.webviewType !== 'editor') && (
                <TabsBar
                    currentView={view}
                    setView={setView}
                    IDE={config.agentIDE || CodyIDE.VSCode}
                    onDownloadChatClick={onDownloadChatClick}
                />
            )}
            {errorMessages && <ErrorBanner errors={errorMessages} setErrors={setErrorMessages} />}
            <TabContainer value={view} ref={tabContainerRef}>
                {view === View.Chat && (
                    <Chat
                        chatEnabled={chatEnabled}
                        messageInProgress={messageInProgress}
                        transcript={transcript}
                        vscodeAPI={vscodeAPI}
                        isTranscriptError={isTranscriptError}
                        guardrails={attributionEnabled ? guardrails : undefined}
                        showIDESnippetActions={showIDESnippetActions}
                        showWelcomeMessage={showWelcomeMessage}
                        scrollableParent={tabContainerRef.current}
                        smartApplyEnabled={smartApplyEnabled}
                        experimentalOneBoxEnabled={experimentalOneBoxEnabled}
                        setView={setView}
                    />
                )}
                {view === View.History && (
                    <HistoryTab
                        IDE={config.agentIDE || CodyIDE.VSCode}
                        setView={setView}
                        webviewType={config.webviewType}
                        multipleWebviewsEnabled={config.multipleWebviewsEnabled}
                        userHistory={userHistory}
                    />
                )}
                {view === View.Prompts && <PromptsTab setView={setView} />}
                {view === View.Account && <AccountTab setView={setView} />}
                {view === View.Settings && <SettingsTab />}
            </TabContainer>
        </TabRoot>
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
