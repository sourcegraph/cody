import { CodyIDE } from '@sourcegraph/cody-shared'
import type React from 'react'
import type { ComponentProps, FunctionComponent } from 'react'
import type { ConfigurationSubsetForWebview, LocalEnv } from '../src/chat/protocol'
import styles from './App.module.css'
import { Chat } from './Chat'
import { TabContainer, TabRoot } from './components/shadcn/ui/tabs'
import { AccountTab, CommandsTab, HistoryTab, SettingsTab, TabsBar, View } from './tabs'

/**
 * The Cody tab panel, with tabs for chat, history, prompts, etc.
 */
export const CodyPanel: FunctionComponent<
    {
        view: View
        setView: (view: View) => void
        config: LocalEnv & ConfigurationSubsetForWebview
        errorMessages: string[]
        setErrorMessages: (errors: string[]) => void
        attributionEnabled: boolean
    } & Pick<
        ComponentProps<typeof Chat>,
        | 'chatID'
        | 'chatEnabled'
        | 'userInfo'
        | 'messageInProgress'
        | 'transcript'
        | 'vscodeAPI'
        | 'isTranscriptError'
        | 'guardrails'
        | 'showWelcomeMessage'
        | 'showIDESnippetActions'
        | 'scrollableParent'
    > &
        Pick<ComponentProps<typeof HistoryTab>, 'userHistory'> &
        Pick<ComponentProps<typeof CommandsTab>, 'commands'>
> = ({
    view,
    setView,
    config,
    errorMessages,
    setErrorMessages,
    attributionEnabled,
    chatID,
    chatEnabled,
    userInfo,
    messageInProgress,
    transcript,
    vscodeAPI,
    isTranscriptError,
    guardrails,
    showIDESnippetActions,
    scrollableParent,
    showWelcomeMessage,
    userHistory,
    commands,
}) => {
    return (
        <TabRoot
            defaultValue={View.Chat}
            value={view}
            orientation="vertical"
            className={styles.outerContainer}
        >
            {/* Shows tab bar for sidebar chats only. */}
            {config.webviewType === 'editor' ? null : (
                <TabsBar currentView={view} setView={setView} IDE={config.agentIDE || CodyIDE.VSCode} />
            )}
            {errorMessages && <ErrorBanner errors={errorMessages} setErrors={setErrorMessages} />}
            <TabContainer value={view}>
                {view === 'chat' && (
                    <Chat
                        chatID={chatID}
                        chatEnabled={chatEnabled}
                        userInfo={userInfo}
                        messageInProgress={messageInProgress}
                        transcript={transcript}
                        vscodeAPI={vscodeAPI}
                        isTranscriptError={isTranscriptError}
                        guardrails={attributionEnabled ? guardrails : undefined}
                        showIDESnippetActions={showIDESnippetActions}
                        showWelcomeMessage={showWelcomeMessage}
                        scrollableParent={scrollableParent}
                    />
                )}
                {view === 'history' && <HistoryTab userHistory={userHistory} />}
                {view === 'commands' && (
                    <CommandsTab setView={setView} IDE={config.agentIDE} commands={commands} />
                )}
                {view === 'account' && <AccountTab userInfo={userInfo} />}
                {view === 'settings' && <SettingsTab userInfo={userInfo} />}
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
