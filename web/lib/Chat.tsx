import { URI } from 'vscode-uri'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
    type ChatMessage,
    type Model,
    type ClientStateForWebview,
    isErrorLike,
    PromptString,
    setDisplayPathEnvInfo,
    MentionQueryResolutionMode,
} from '@sourcegraph/cody-shared'

import { Chat, type UserAccountInfo } from '@sourcegraph/vscode-cody/webviews/Chat'
import {
    type ChatModelContext,
    ChatModelContextProvider,
} from '@sourcegraph/vscode-cody/webviews/chat/models/chatModelContext'
import {
    createWebviewTelemetryRecorder,
    createWebviewTelemetryService,
    TelemetryRecorderContext
} from '@sourcegraph/vscode-cody/webviews/utils/telemetry'
import { WithContextProviders } from '@sourcegraph/vscode-cody/webviews/mentions/providers'
import { ChatMentionContext } from '@sourcegraph/vscode-cody/webviews/promptEditor/plugins/atMentions/chatContextClient'
import { ClientStateContextProvider, useClientActionDispatcher, } from '@sourcegraph/vscode-cody/webviews/client/clientState'

import { useWebAgentClient } from './Provider';

import './styles.css'

// Internal API mock call in order to set up web version of
// the cody agent properly (completely mock data)
setDisplayPathEnvInfo({
    isWindows: false,
    workspaceFolders: [URI.file('/tmp/foo')]
})

// Setup mention plugin to request data with remote strategy
// since Cody Web doesn't have access to local file system
const WEB_MENTION_RESOLUTION = {
    resolutionMode: MentionQueryResolutionMode.Remote
}

interface RepositoryMetadata {
    id: string
    name: string
}

export interface CodyWebChatProps {
    repositories: RepositoryMetadata[]
    className?: string
}

// NOTE: This code is copied from the VS Code webview's App component and implements a subset of the
// functionality for the experimental web chat prototype.
export const CodyWebChat: FC<CodyWebChatProps> = props => {
    const { repositories, className } = props

    const {
        activeWebviewPanelID,
        vscodeAPI,
        client
    } = useWebAgentClient()

    const rootElementRef = useRef<HTMLDivElement>(null)

    const [isTranscriptError, setIsTranscriptError] = useState<boolean>(false)
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    const [transcript, setTranscript] = useState<ChatMessage[]>([])
    const [userAccountInfo, setUserAccountInfo] = useState<UserAccountInfo>()
    const [chatModels, setChatModels] = useState<Model[]>()

    const [clientState, setClientState] = useState<ClientStateForWebview>({
        initialContext: [],
    })

    const dispatchClientAction = useClientActionDispatcher()

    useEffect(() => {
        ;(async () => {
            if (!client || isErrorLike(client)) {
                return
            }

            try {
                await client.rpc.sendRequest('webview/receiveMessage', {
                    id: activeWebviewPanelID.current,
                    message: {
                        command: 'context/choose-remote-search-repo',
                        explicitRepos: repositories
                    }
                })
            } catch (error) {
                console.error(error)
            }
        })()
    }, [client, repositories, activeWebviewPanelID]);

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
                case 'clientState':
                    setClientState(message.value)
                    break
                case 'clientAction':
                    dispatchClientAction(message)
                    break
            }
        })
    }, [vscodeAPI])

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
                                            userInfo={userAccountInfo}
                                            messageInProgress={messageInProgress}
                                            transcript={transcript}
                                            vscodeAPI={vscodeAPI}
                                            telemetryService={telemetryService}
                                            isTranscriptError={isTranscriptError}
                                            scrollableParent={rootElementRef.current}
                                        />
                                    </WithContextProviders>
                                </ClientStateContextProvider>
                            </ChatModelContextProvider>
                        </TelemetryRecorderContext.Provider>
                    </ChatMentionContext.Provider>
            )) : (
                <>Loading...</>
            )}
        </div>
    )
}
