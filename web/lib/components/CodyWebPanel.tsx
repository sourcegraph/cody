import { type FC, useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { URI } from 'vscode-uri'

import {
    type AuthStatus,
    type ChatMessage,
    type ClientStateForWebview,
    CodyIDE,
    type ContextItem,
    type ContextItemRepository,
    ContextItemSource,
    type Model,
    PromptString,
    type SerializedChatTranscript,
    isErrorLike,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'

import { ChatMentionContext, type ChatMentionsSettings } from '@sourcegraph/prompt-editor'
import { getAppWrappers } from 'cody-ai/webviews/App'
import type { UserAccountInfo } from 'cody-ai/webviews/Chat'
import { ChatEnvironmentContext } from 'cody-ai/webviews/chat/ChatEnvironmentContext'
import type { ChatModelContext } from 'cody-ai/webviews/chat/models/chatModelContext'
import { useClientActionDispatcher } from 'cody-ai/webviews/client/clientState'
import { createWebviewTelemetryRecorder } from 'cody-ai/webviews/utils/telemetry'

import { useWebAgentClient } from './CodyWebPanelProvider'

// Include global Cody Web styles to the styles bundle
import '../global-styles/styles.css'
import type { ConfigurationSubsetForWebview, LocalEnv } from 'cody-ai/src/chat/protocol'
import { CodyPanel } from 'cody-ai/webviews/CodyPanel'
import type { View } from 'cody-ai/webviews/tabs'
import { ComposedWrappers, type Wrapper } from 'cody-ai/webviews/utils/composeWrappers'
import styles from './CodyWebPanel.module.css'

const CONTEXT_MENTIONS_SETTINGS: ChatMentionsSettings = {
    resolutionMode: 'remote',
}

// Internal API mock call in order to set up web version of
// the cody agent properly (completely mock data)
setDisplayPathEnvInfo({
    isWindows: false,
    workspaceFolders: [URI.file('/tmp/foo')],
})

export interface CodyWebPanelProps {
    className?: string
}

// NOTE: This code is implements a subset of the
// functionality for the experimental web chat prototype.
export const CodyWebPanel: FC<CodyWebPanelProps> = props => {
    const { className } = props

    const { vscodeAPI, client, initialContext } = useWebAgentClient()
    const dispatchClientAction = useClientActionDispatcher()

    const [errorMessages, setErrorMessages] = useState<string[]>([])
    const [isTranscriptError, setIsTranscriptError] = useState<boolean>(false)
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    const [transcript, setTranscript] = useState<ChatMessage[]>([])
    const [userAccountInfo, setUserAccountInfo] = useState<UserAccountInfo>()
    const [chatModels, setChatModels] = useState<Model[]>()
    const [serverSentModelsEnabled, setServerSentModelsEnabled] = useState<boolean>(false)
    const [config, setConfig] = useState<(LocalEnv & ConfigurationSubsetForWebview) | null>(null)
    const [view, setView] = useState<View | undefined>()
    const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null)
    const [userHistory, setUserHistory] = useState<SerializedChatTranscript[]>()

    useLayoutEffect(() => {
        vscodeAPI.onMessage(message => {
            switch (message.type) {
                case 'transcript': {
                    const deserializedMessages = message.messages.map(
                        PromptString.unsafe_deserializeChatMessage
                    )
                    if (message.isMessageInProgress) {
                        const msgLength = deserializedMessages.length - 1
                        setTranscript(deserializedMessages.slice(0, msgLength))
                        setMessageInProgress(deserializedMessages[msgLength])
                        setIsTranscriptError(false)
                    } else {
                        setTranscript(deserializedMessages)
                        setMessageInProgress(null)
                    }
                    break
                }
                case 'errors':
                    setErrorMessages(prev => [...prev, message.errors].slice(-5))
                    break
                case 'view':
                    setView(message.view)
                    break
                case 'transcript-errors':
                    setIsTranscriptError(message.isTranscriptError)
                    break
                case 'chatModels':
                    // The default model will always be the first one on the list.
                    setChatModels(message.models)
                    break
                case 'config':
                    setConfig(message.config)
                    setAuthStatus(message.authStatus)
                    setUserAccountInfo({
                        isCodyProUser: !message.authStatus.userCanUpgrade,
                        isDotComUser: message.authStatus.isDotCom,
                        user: message.authStatus,
                        ide: CodyIDE.Web,
                    })
                    break
                case 'clientAction':
                    dispatchClientAction(message)
                    break
                case 'setConfigFeatures':
                    setServerSentModelsEnabled(!!message.configFeatures.serverSentModels)
                    break
                case 'history':
                    setUserHistory(Object.values(message.localHistory?.chat ?? {}))
                    break
            }
        })
    }, [vscodeAPI, dispatchClientAction])

    // V2 telemetry recorder
    const telemetryRecorder = useMemo(() => createWebviewTelemetryRecorder(vscodeAPI), [vscodeAPI])

    const onCurrentChatModelChange = useCallback(
        (selected: Model): void => {
            if (!chatModels || !setChatModels) {
                return
            }
            // Notify the host about the manual change,
            // and the host will return the updated change models via onMessage.
            vscodeAPI.postMessage({
                command: 'chatModel',
                model: selected.model,
            })
        },
        [chatModels, vscodeAPI]
    )
    const chatModelContext = useMemo<ChatModelContext>(
        () => ({ chatModels, onCurrentChatModelChange, serverSentModelsEnabled }),
        [chatModels, onCurrentChatModelChange, serverSentModelsEnabled]
    )

    const clientState: ClientStateForWebview = useMemo<ClientStateForWebview>(() => {
        const { repositories = [], fileURL } = initialContext ?? {}

        if (repositories.length === 0) {
            return { initialContext: [] }
        }

        const mentions: ContextItem[] = repositories.map<ContextItemRepository>(repo => ({
            type: 'repository',
            id: repo.id,
            name: repo.name,
            repoID: repo.id,
            repoName: repo.name,
            uri: URI.parse(`repo:${repo.name}`),
            content: null,
            source: ContextItemSource.Initial,
            icon: 'folder',
        }))

        if (fileURL) {
            mentions.push({
                type: 'file',
                isIgnored: false,
                range: initialContext?.fileRange
                    ? {
                          start: { line: initialContext.fileRange.startLine, character: 0 },
                          end: { line: initialContext.fileRange.endLine + 1, character: 0 },
                      }
                    : undefined,
                remoteRepositoryName: repositories[0].name,
                uri: URI.file(repositories[0].name + fileURL),
                source: ContextItemSource.Initial,
            })
        }

        return {
            initialContext: mentions,
        }
    }, [initialContext])

    const envVars = useMemo(() => ({ clientType: CodyIDE.Web }), [])

    const wrappers = useMemo<Wrapper[]>(
        () =>
            getAppWrappers(
                vscodeAPI,
                telemetryRecorder,
                chatModelContext,
                clientState,
                config && authStatus ? { config, authStatus } : undefined
            ),
        [vscodeAPI, telemetryRecorder, chatModelContext, clientState, config, authStatus]
    )

    const isLoading = !client || !userAccountInfo || !chatModels || !config || !view || !userHistory

    return (
        <div className={className} data-cody-web-chat={true}>
            {!isLoading ? (
                isErrorLike(client) ? (
                    <p>Error: {client.message}</p>
                ) : (
                    <ChatEnvironmentContext.Provider value={envVars}>
                        <ChatMentionContext.Provider value={CONTEXT_MENTIONS_SETTINGS}>
                            <ComposedWrappers wrappers={wrappers}>
                                <CodyPanel
                                    view={view}
                                    setView={setView}
                                    errorMessages={errorMessages}
                                    setErrorMessages={setErrorMessages}
                                    attributionEnabled={false}
                                    config={config}
                                    userHistory={userHistory}
                                    chatEnabled={true}
                                    showWelcomeMessage={true}
                                    showIDESnippetActions={true}
                                    userInfo={userAccountInfo}
                                    messageInProgress={messageInProgress}
                                    transcript={transcript}
                                    vscodeAPI={vscodeAPI}
                                    isTranscriptError={isTranscriptError}
                                />
                            </ComposedWrappers>
                        </ChatMentionContext.Provider>
                    </ChatEnvironmentContext.Provider>
                )
            ) : (
                <div className={styles.loading}>Loading Cody Client...</div>
            )}
        </div>
    )
}
