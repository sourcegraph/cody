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
import { StorageWarningBanner } from './chat/StorageWarningBanner'
import { useClientActionDispatcher } from './client/clientState'
import { Notices } from './components/Notices'
import { StateDebugOverlay } from './components/StateDebugOverlay'
import type { ServerType } from './components/mcp'
import { ServerHome, getMcpServerType } from './components/mcp/ServerHome'
import { TabContainer, TabRoot } from './components/shadcn/ui/tabs'
import { HistoryTab, TabsBar, View } from './tabs'
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
    chatEnabled: boolean
    chatCodeHighlightingEnabled: boolean
    instanceNotices: CodyNotice[]
    messageInProgress: ChatMessage | null
    transcript: ChatMessage[]
    tokenUsage?:
        | {
              completionTokens?: number | null | undefined
              promptTokens?: number | null | undefined
              totalTokens?: number | null | undefined
          }
        | null
        | undefined
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage' | 'onMessage'>
    setErrorMessages: (errors: string[]) => void
    guardrails: Guardrails
    showWelcomeMessage?: boolean
    showIDESnippetActions?: boolean
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
    chatEnabled,
    chatCodeHighlightingEnabled,
    instanceNotices,
    messageInProgress,
    transcript,
    tokenUsage,
    vscodeAPI,
    showIDESnippetActions,
    showWelcomeMessage,
    onExternalApiReady,
    onExtensionApiReady,
    guardrails,
}) => {
    const tabContainerRef = useRef<HTMLDivElement>(null)

    const user = useUserAccountInfo()
    const externalAPI = useExternalAPI()
    const api = useExtensionAPI()
    const { value: chatModels } = useObservable(useMemo(() => api.chatModels(), [api.chatModels]))
    const { value: mcpServers } = useObservable<ServerType[] | undefined>(
        useMemo(
            () => api.mcpSettings()?.map(servers => servers?.map(s => getMcpServerType(s))),
            [api.mcpSettings]
        )
    )
    // workspace upgrade eligibility should be that the flag is set, is on dotcom and only has one account. This prevents enterprise customers that are logged into multiple endpoints from seeing the CTA
    const isWorkspacesUpgradeCtaEnabled =
        useFeatureFlag(FeatureFlag.SourcegraphTeamsUpgradeCTA) &&
        isDotComUser &&
        config.endpointHistory?.length === 1
    useEffect(() => {
        onExternalApiReady?.(externalAPI)
    }, [onExternalApiReady, externalAPI])

    useEffect(() => {
        if (view === View.Mcp && mcpServers === undefined) {
            setView(View.Chat)
        }
    }, [view, setView, mcpServers])

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
                <Notices instanceNotices={instanceNotices} />
                {/* Hide tab bar in editor chat panels. */}
                {config.webviewType !== 'editor' && (
                    <TabsBar
                        user={user}
                        currentView={view}
                        setView={setView}
                        endpointHistory={config.endpointHistory ?? []}
                        isWorkspacesUpgradeCtaEnabled={isWorkspacesUpgradeCtaEnabled}
                        showOpenInEditor={!!config?.multipleWebviewsEnabled}
                    />
                )}
                {errorMessages && (
                    <ErrorBanner
                        errors={errorMessages}
                        setErrors={setErrorMessages}
                        vscodeAPI={vscodeAPI}
                    />
                )}
                <TabContainer value={view} ref={tabContainerRef} data-scrollable>
                    {view === View.Chat && (
                        <Chat
                            chatEnabled={chatEnabled}
                            chatCodeHighlightingEnabled={chatCodeHighlightingEnabled}
                            messageInProgress={messageInProgress}
                            transcript={transcript}
                            tokenUsage={tokenUsage}
                            models={chatModels || []}
                            vscodeAPI={vscodeAPI}
                            guardrails={guardrails}
                            showIDESnippetActions={showIDESnippetActions}
                            showWelcomeMessage={showWelcomeMessage}
                            setView={setView}
                            isWorkspacesUpgradeCtaEnabled={isWorkspacesUpgradeCtaEnabled}
                        />
                    )}
                    {view === View.History && (
                        <HistoryTab
                            IDE={clientCapabilities.agentIDE}
                            extensionAPI={api}
                            setView={setView}
                            webviewType={config.webviewType}
                            multipleWebviewsEnabled={config.multipleWebviewsEnabled}
                        />
                    )}
                    {view === View.Mcp && mcpServers !== undefined && (
                        <ServerHome mcpServers={mcpServers} IDE={clientCapabilities.agentIDE} />
                    )}
                </TabContainer>
                <StateDebugOverlay />
            </TabRoot>
        </TabViewContext.Provider>
    )
}

const ErrorBanner: React.FunctionComponent<{
    errors: string[]
    setErrors: (errors: string[]) => void
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage' | 'onMessage'>
}> = ({ errors, setErrors, vscodeAPI }) => {
    if (errors.some(error => error.startsWith('STORAGE_WARNING'))) {
        const extensionAPI = useExtensionAPI()
        return <StorageWarningBanner extensionAPI={extensionAPI} vscodeAPI={vscodeAPI} />
    }

    return (
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
}

interface ExternalPrompt {
    text: string
    autoSubmit: boolean
    mode?: ChatMessage['intent']
}

interface CodyExternalApi {
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
