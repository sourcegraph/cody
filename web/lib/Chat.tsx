import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { URI } from 'vscode-uri'

import {
    type ChatMessage,
    type ClientStateForWebview,
    type ContextItem,
    type ContextItemRepository,
    ContextItemSource,
    MentionQueryResolutionMode,
    type Model,
    PromptString,
    createRemoteFileURI,
    isErrorLike,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'

import { Chat, type UserAccountInfo } from 'cody-ai/webviews/Chat'
import {
    type ChatModelContext,
    ChatModelContextProvider,
} from 'cody-ai/webviews/chat/models/chatModelContext'
import {
    ClientStateContextProvider,
    useClientActionDispatcher,
} from 'cody-ai/webviews/client/clientState'
import { WithContextProviders } from 'cody-ai/webviews/mentions/providers'
import { ChatMentionContext } from 'cody-ai/webviews/promptEditor/plugins/atMentions/chatContextClient'
import {
    TelemetryRecorderContext,
    createWebviewTelemetryRecorder,
    createWebviewTelemetryService,
} from 'cody-ai/webviews/utils/telemetry'

import { useWebAgentClient } from './Provider'

import './styles.css'
import styles from './Chat.module.css'

// Internal API mock call in order to set up web version of
// the cody agent properly (completely mock data)
setDisplayPathEnvInfo({
    isWindows: false,
    workspaceFolders: [URI.file('/tmp/foo')],
})

// Setup mention plugin to request data with remote strategy
// since Cody Web doesn't have access to local file system
const WEB_MENTION_RESOLUTION = {
    resolutionMode: MentionQueryResolutionMode.Remote,
}

export interface CodyWebChatProps {
    className?: string
}

// NOTE: This code is implements a subset of the
// functionality for the experimental web chat prototype.
export const CodyWebChat: FC<CodyWebChatProps> = props => {
    const { className } = props

    const { vscodeAPI, client } = useWebAgentClient()

    const { initialContext } = useWebAgentClient()
    const rootElementRef = useRef<HTMLDivElement>(null)

    const [isTranscriptError, setIsTranscriptError] = useState<boolean>(false)
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    const [transcript, setTranscript] = useState<ChatMessage[]>([])
    const [userAccountInfo, setUserAccountInfo] = useState<UserAccountInfo>()
    const [chatModels, setChatModels] = useState<Model[]>()

    const dispatchClientAction = useClientActionDispatcher()

    useEffect(() => {
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
                    setChatModels(message.models)
                    break
                case 'config':
                    setUserAccountInfo({
                        isCodyProUser: !message.authStatus.userCanUpgrade,
                        isDotComUser: message.authStatus.isDotCom,
                        user: message.authStatus,
                    })
                    break
                case 'clientAction':
                    dispatchClientAction(message)
                    break
            }
        })
    }, [vscodeAPI, dispatchClientAction])

    useEffect(() => {
        // Notify the extension host that we are ready to receive events.
        vscodeAPI.postMessage({ command: 'ready' })
    }, [vscodeAPI])

    // Deprecated V1 telemetry
    const telemetryService = useMemo(() => createWebviewTelemetryService(vscodeAPI), [vscodeAPI])
    // V2 telemetry recorder
    const telemetryRecorder = useMemo(() => createWebviewTelemetryRecorder(vscodeAPI), [vscodeAPI])

    const onCurrentChatModelChange = useCallback(
        (selected: Model): void => {
            if (!chatModels || !setChatModels) {
                return
            }
            vscodeAPI.postMessage({
                command: 'chatModel',
                model: selected.model,
            })
            const updatedChatModels = chatModels.map(m =>
                m.model === selected.model ? { ...m, default: true } : { ...m, default: false }
            )
            setChatModels(updatedChatModels)
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
                uri: createRemoteFileURI(repositories[0].name, fileURL),
                source: ContextItemSource.Initial,
            })
        }

        return {
            initialContext: mentions,
        }
    }, [initialContext])

    return (
        <div className={className} data-cody-web-chat={true} ref={rootElementRef}>
            {client && userAccountInfo && chatModels ? (
                isErrorLike(client) ? (
                    <p>Error: {client.message}</p>
                ) : (
                    <ChatMentionContext.Provider value={WEB_MENTION_RESOLUTION}>
                        <TelemetryRecorderContext.Provider value={telemetryRecorder}>
                            <ChatModelContextProvider value={chatModelContext}>
                                <ClientStateContextProvider value={clientState}>
                                    <WithContextProviders>
                                        <Chat
                                            chatEnabled={true}
                                            showSnippetActions={false}
                                            showWelcomeMessage={false}
                                            userInfo={userAccountInfo}
                                            messageInProgress={messageInProgress}
                                            transcript={transcript}
                                            vscodeAPI={vscodeAPI}
                                            telemetryService={telemetryService}
                                            isTranscriptError={isTranscriptError}
                                            scrollableParent={rootElementRef.current}
                                            className={styles.chat}
                                        />
                                    </WithContextProviders>
                                </ClientStateContextProvider>
                            </ChatModelContextProvider>
                        </TelemetryRecorderContext.Provider>
                    </ChatMentionContext.Provider>
                )
            ) : (
                <div className={styles.loading}>Loading Cody Agent...</div>
            )}
        </div>
    )
}
