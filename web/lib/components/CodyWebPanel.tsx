import { type FC, useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { URI } from 'vscode-uri'

import {
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
import { ChatEnvironmentContext } from 'cody-ai/webviews/chat/ChatEnvironmentContext'
import type { ChatModelContext } from 'cody-ai/webviews/chat/models/chatModelContext'
import { useClientActionDispatcher } from 'cody-ai/webviews/client/clientState'
import { createWebviewTelemetryRecorder } from 'cody-ai/webviews/utils/telemetry'

import { useWebAgentClient } from './CodyWebPanelProvider'

// Include global Cody Web styles to the styles bundle
import '../global-styles/styles.css'
import { CodyPanel } from 'cody-ai/webviews/CodyPanel'
import type { View } from 'cody-ai/webviews/tabs'
import { ComposedWrappers, type Wrapper } from 'cody-ai/webviews/utils/composeWrappers'
import type { Config } from 'cody-ai/webviews/utils/useConfig'
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
    const [chatModels, setChatModels] = useState<Model[]>()
    const [config, setConfig] = useState<Config | null>(null)
    const [view, setView] = useState<View | undefined>()
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
                    message.config.webviewType = 'sidebar'
                    message.config.multipleWebviewsEnabled = false
                    setConfig(message)
                    break
                case 'clientAction':
                    dispatchClientAction(message)
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
                model: selected.id,
            })
        },
        [chatModels, vscodeAPI]
    )
    const chatModelContext = useMemo<ChatModelContext>(
        () => ({
            chatModels,
            onCurrentChatModelChange,
            serverSentModelsEnabled: config?.configFeatures.serverSentModels,
        }),
        [chatModels, onCurrentChatModelChange, config]
    )

    const clientState: ClientStateForWebview = useMemo<ClientStateForWebview>(() => {
        const { repository, fileURL } = initialContext ?? {}

        if (!repository) {
            return { initialContext: [] }
        }

        const mentions: ContextItem[] = [
            {
                type: 'repository',
                id: repository.id,
                name: repository.name,
                repoID: repository.id,
                repoName: repository.name,
                description: repository.name,
                uri: URI.parse(`repo:${repository.name}`),
                content: null,
                source: ContextItemSource.Initial,
                icon: 'folder',
                title: 'Current Repository',
            } as ContextItemRepository,
        ]

        if (fileURL) {
            mentions.push({
                type: 'file',
                title: initialContext?.fileRange ? 'Current Selection' : 'Current File',
                isIgnored: false,
                range: initialContext?.fileRange
                    ? {
                          start: { line: initialContext.fileRange.startLine, character: 0 },
                          end: { line: initialContext.fileRange.endLine + 1, character: 0 },
                      }
                    : undefined,
                remoteRepositoryName: repository.name,
                uri: URI.file(repository.name + fileURL),
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
            getAppWrappers(vscodeAPI, telemetryRecorder, chatModelContext, clientState, config, envVars),
        [vscodeAPI, telemetryRecorder, chatModelContext, clientState, config, envVars]
    )

    const isLoading = !client || !chatModels || !config || !view || !userHistory

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
                                    config={config.config}
                                    userHistory={userHistory}
                                    chatEnabled={true}
                                    showWelcomeMessage={true}
                                    showIDESnippetActions={false}
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
