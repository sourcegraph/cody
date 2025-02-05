import {
    type AuthStatus,
    type ChatMessage,
    type ClientCapabilitiesWithLegacyFields,
    type CodyNotice,
    FeatureFlag,
    type Guardrails,
    type UserProductSubscription,
    type WebviewToExtensionAPI,
    firstValueFrom,
} from '@sourcegraph/cody-shared'
import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import type React from 'react'
import { type FunctionComponent, useEffect, useMemo, useRef } from 'react'
import type { ConfigurationSubsetForWebview, LocalEnv } from '../src/chat/protocol'
import styles from './App.module.css'
import { Chat } from './Chat'
import { useClientActionDispatcher } from './client/clientState'
import { Notices } from './components/Notices'
import { StateDebugOverlay } from './components/StateDebugOverlay'
import { TabContainer, TabRoot } from './components/shadcn/ui/tabs'
import { HistoryTab, PromptsTab, SettingsTab, TabsBar, View } from './tabs'
import type { VSCodeWrapper } from './utils/VSCodeApi'
import { useUserAccountInfo } from './utils/useConfig'
import { useFeatureFlag } from './utils/useFeatureFlags'
import { TabViewContext } from './utils/useTabView'

interface CodyPanelProps {
    view: View
    setView: (view: View) => void
    configuration: {
        config: LocalEnv & ConfigurationSubsetForWebview
        clientCapabilities: ClientCapabilitiesWithLegacyFields
        authStatus: AuthStatus
        isDotComUser: boolean
        userProductSubscription?: UserProductSubscription | null | undefined
    }
    errorMessages: string[]
    attributionEnabled: boolean
    chatEnabled: boolean
    instanceNotices: CodyNotice[]
    messageInProgress: ChatMessage | null
    transcript: ChatMessage[]
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage' | 'onMessage'>
    setErrorMessages: (errors: string[]) => void
    guardrails?: Guardrails
    showWelcomeMessage?: boolean
    showIDESnippetActions?: boolean
    smartApplyEnabled?: boolean
    onExternalApiReady?: (api: CodyExternalApi) => void
    onExtensionApiReady?: (api: WebviewToExtensionAPI) => void
}

/**
 * The Cody tab panel, with tabs for chat, history, prompts, etc.
 */
export const CodyPanel: FunctionComponent<CodyPanelProps> = ({
    view,
    setView,
    configuration: { config, clientCapabilities, isDotComUser },
    errorMessages,
    setErrorMessages,
    attributionEnabled,
    chatEnabled,
    instanceNotices,
    messageInProgress,
    transcript,
    vscodeAPI,
    guardrails,
    showIDESnippetActions,
    showWelcomeMessage,
    smartApplyEnabled,
    onExternalApiReady,
    onExtensionApiReady,
}) => {
    const tabContainerRef = useRef<HTMLDivElement>(null)

    const user = useUserAccountInfo()
    const externalAPI = useExternalAPI()
    const api = useExtensionAPI()
    const { value: chatModels } = useObservable(useMemo(() => api.chatModels(), [api.chatModels]))
    const isPromptsV2Enabled = useFeatureFlag(FeatureFlag.CodyPromptsV2)
    // workspace upgrade eligibility should be that the flag is set, is on dotcom and only has one account. This prevents enterprise customers that are logged into multiple endpoints from seeing the CTA
    const isWorkspacesUpgradeCtaEnabled =
        useFeatureFlag(FeatureFlag.SourcegraphTeamsUpgradeCTA) &&
        isDotComUser &&
        config.endpointHistory?.length === 1
    useEffect(() => {
        onExternalApiReady?.(externalAPI)
    }, [onExternalApiReady, externalAPI])

    useEffect(() => {
        onExtensionApiReady?.(api)
    }, [onExtensionApiReady, api])

    useEffect(() => {
        const subscription = api.clientActionBroadcast().subscribe(action => {
            switch (action.type) {
                case 'open-recently-prompts': {
                    document
                        .querySelector<HTMLButtonElement>("button[aria-label='Insert prompt']")
                        ?.click()
                }
            }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [api.clientActionBroadcast])

    return (
        <TabViewContext.Provider value={useMemo(() => ({ view, setView }), [view, setView])}>
            <TabRoot
                defaultValue={View.Chat}
                value={view}
                orientation="vertical"
                className={styles.outerContainer}
            >
                <Notices user={user} instanceNotices={instanceNotices} />
                {/* Hide tab bar in editor chat panels. */}
                {config.webviewType !== 'editor' && (
                    <TabsBar
                        user={user}
                        currentView={view}
                        setView={setView}
                        endpointHistory={config.endpointHistory ?? []}
                        isWorkspacesUpgradeCtaEnabled={isWorkspacesUpgradeCtaEnabled}
                    />
                )}
                {errorMessages && <ErrorBanner errors={errorMessages} setErrors={setErrorMessages} />}
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
                            isPromptsV2Enabled={isPromptsV2Enabled}
                            setView={setView}
                            isWorkspacesUpgradeCtaEnabled={isWorkspacesUpgradeCtaEnabled}
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
                    {view === View.Prompts && (
                        <PromptsTab
                            IDE={clientCapabilities.agentIDE}
                            setView={setView}
                            isPromptsV2Enabled={isPromptsV2Enabled}
                        />
                    )}
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

export interface ExternalPrompt {
    text: string
    autoSubmit: boolean
    mode?: ChatMessage['intent']
}

export interface CodyExternalApi {
    runPrompt: (action: ExternalPrompt) => Promise<void>
}

function useExternalAPI(): CodyExternalApi {
    const dispatchClientAction = useClientActionDispatcher()
    const extensionAPI = useExtensionAPI()

    return useMemo(
        () => ({
            runPrompt: async (prompt: ExternalPrompt) => {
                const promptEditorState = await firstValueFrom(
                    extensionAPI.hydratePromptMessage(prompt.text)
                )

                dispatchClientAction(
                    {
                        editorState: promptEditorState,
                        submitHumanInput: prompt.autoSubmit,
                        setLastHumanInputIntent: prompt.mode ?? 'chat',
                    },
                    // Buffer because PromptEditor is not guaranteed to be mounted after the `setView`
                    // call above, and it needs to be mounted to receive the action.
                    { buffer: true }
                )
            },
        }),
        [extensionAPI, dispatchClientAction]
    )
}
