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
    isErrorLike,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'

import { Chat, type UserAccountInfo } from 'cody-ai/webviews/Chat'
import { ChatEnvironmentContext } from 'cody-ai/webviews/chat/ChatEnvironmentContext'
import {
    type ChatModelContext,
    ChatModelContextProvider,
} from 'cody-ai/webviews/chat/models/chatModelContext'
import {
    ClientStateContextProvider,
    useClientActionDispatcher,
} from 'cody-ai/webviews/client/clientState'
import { WithContextProviders } from 'cody-ai/webviews/mentions/providers'
import {
    ChatMentionContext,
    type ChatMentionsSettings,
} from 'cody-ai/webviews/promptEditor/plugins/atMentions/chatContextClient'
import {
    TelemetryRecorderContext,
    createWebviewTelemetryRecorder,
} from 'cody-ai/webviews/utils/telemetry'

import { useWebAgentClient } from './CodyWebChatProvider'

// Include global Cody Web styles to the styles bundle
import '../global-styles/styles.css'
import styles from './CodyWebChat.module.css'

const CONTEXT_MENTIONS_SETTINGS: ChatMentionsSettings = {
    resolutionMode: 'remote',
}

// Internal API mock call in order to set up web version of
// the cody agent properly (completely mock data)
setDisplayPathEnvInfo({
    isWindows: false,
    workspaceFolders: [URI.file('/tmp/foo')],
})

export interface CodyWebChatProps {
    className?: string
}

// NOTE: This code is implements a subset of the
// functionality for the experimental web chat prototype.
export const CodyWebChat: FC<CodyWebChatProps> = props => {
    const { className } = props

    const { vscodeAPI, client, activeChatID, activeWebviewPanelID, initialContext } = useWebAgentClient()
    const dispatchClientAction = useClientActionDispatcher()

    const [initialization, setInitialization] = useState<'init' | 'completed'>('init')

    const [rootElement, setRootElement] = useState<HTMLElement | null>()
    const [isTranscriptError, setIsTranscriptError] = useState<boolean>(false)
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    const [transcript, setTranscript] = useState<ChatMessage[]>([])
    const [userAccountInfo, setUserAccountInfo] = useState<UserAccountInfo>()
    const [chatModels, setChatModels] = useState<Model[]>()

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
                case 'transcript-errors':
                    setIsTranscriptError(message.isTranscriptError)
                    break
                case 'chatModels':
                    // The default model will always be the first one on the list.
                    setChatModels(message.models)
                    break
                case 'config':
                    setUserAccountInfo({
                        isCodyProUser: !message.authStatus.userCanUpgrade,
                        isDotComUser: message.authStatus.isDotCom,
                        isOldStyleEnterpriseUser: !message.authStatus.isDotCom,
                        user: message.authStatus,
                        ide: CodyIDE.Web,
                    })
                    break
                case 'clientAction':
                    dispatchClientAction(message)
                    break
            }
        })
    }, [vscodeAPI, dispatchClientAction])

    useLayoutEffect(() => {
        if (initialization === 'completed') {
            return
        }

        if (client && !isErrorLike(client) && activeChatID && activeWebviewPanelID) {
            // Notify the extension host that we are ready to receive events.
            vscodeAPI.postMessage({ command: 'ready' })
            vscodeAPI.postMessage({ command: 'initialized' })

            client.rpc
                .sendRequest('webview/receiveMessage', {
                    id: activeWebviewPanelID,
                    message: { command: 'restoreHistory', chatID: activeChatID },
                })
                .then(() => {
                    setInitialization('completed')
                })
        }
    }, [initialization, vscodeAPI, activeChatID, activeWebviewPanelID, client])

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
        () => ({ chatModels, onCurrentChatModelChange }),
        [chatModels, onCurrentChatModelChange]
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

    return (
        <div className={className} data-cody-web-chat={true} ref={setRootElement}>
            {client &&
            userAccountInfo &&
            chatModels &&
            activeChatID &&
            initialization === 'completed' ? (
                isErrorLike(client) ? (
                    <p>Error: {client.message}</p>
                ) : (
                    <ChatEnvironmentContext.Provider value={envVars}>
                        <ChatMentionContext.Provider value={CONTEXT_MENTIONS_SETTINGS}>
                            <TelemetryRecorderContext.Provider value={telemetryRecorder}>
                                <ChatModelContextProvider value={chatModelContext}>
                                    <ClientStateContextProvider value={clientState}>
                                        <WithContextProviders>
                                            <Chat
                                                chatID={activeChatID}
                                                chatEnabled={true}
                                                showWelcomeMessage={false}
                                                showIDESnippetActions={false}
                                                userInfo={userAccountInfo}
                                                messageInProgress={messageInProgress}
                                                transcript={transcript}
                                                vscodeAPI={vscodeAPI}
                                                isTranscriptError={isTranscriptError}
                                                scrollableParent={rootElement}
                                                className={styles.chat}
                                            />
                                        </WithContextProviders>
                                    </ClientStateContextProvider>
                                </ChatModelContextProvider>
                            </TelemetryRecorderContext.Provider>
                        </ChatMentionContext.Provider>
                    </ChatEnvironmentContext.Provider>
                )
            ) : (
                <div className={styles.loading}>Loading Cody Agent...</div>
            )}
        </div>
    )
}
