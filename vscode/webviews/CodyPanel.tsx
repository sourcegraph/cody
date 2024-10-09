import {
    type AuthStatus,
    type ChatMessage,
    type ClientCapabilities,
    CodyIDE,
    type SerializedPromptEditorValue,
} from '@sourcegraph/cody-shared'
import type React from 'react'
import {
    type ComponentProps,
    type FunctionComponent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
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

    const [activeTranscript, setActiveTranscript] = useState<ChatMessage[] | undefined>(transcript)
    const [storedTranscriptState, setStoredTranscriptState] = useState(transcript)

    // Update the Transcript State for each input box value change.
    const updateEditorStateOnChange = useCallback(
        (index: number, newEditorValue: SerializedPromptEditorValue) => {
            setStoredTranscriptState(prev => {
                const updated = [...prev]
                updated[index] = {
                    ...updated[index],
                    editorState: newEditorValue.editorState,
                    speaker: 'human',
                }
                return updated
            })
        },
        []
    )

    // Reset transcripts on new transcript change.
    useEffect(() => {
        setActiveTranscript(undefined)
        setStoredTranscriptState(transcript)
    }, [transcript])

    // Set the current transcript to the transcript with the last stored editor states when switching to a different tab.
    // This ensures the editor states are preserved when switching back to the chat tab.
    useEffect(() => {
        if (view !== View.Chat) {
            setActiveTranscript(storedTranscriptState)
        }
    }, [view, storedTranscriptState])

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
                            transcript={activeTranscript ?? transcript}
                            updateEditorStateOnChange={updateEditorStateOnChange}
                            chatEnabled={chatEnabled}
                            messageInProgress={messageInProgress}
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
