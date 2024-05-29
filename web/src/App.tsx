import {
    type ChatMessage,
    type ModelProvider,
    PromptString,
    hydrateAfterPostMessage,
    isErrorLike,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'
import { type FunctionComponent, useCallback, useEffect, useMemo, useState } from 'react'
import { URI } from 'vscode-uri'
import type { ExtensionMessage } from '../../vscode/src/chat/protocol'
import { Chat, type UserAccountInfo } from '../../vscode/webviews/Chat'
import {
    type ChatModelContext,
    ChatModelContextProvider,
} from '../../vscode/webviews/chat/models/chatModelContext'
import { type VSCodeWrapper, setVSCodeWrapper } from '../../vscode/webviews/utils/VSCodeApi'
import {
    TelemetryRecorderContext,
    createWebviewTelemetryRecorder,
    createWebviewTelemetryService,
} from '../../vscode/webviews/utils/telemetry'
import { type AgentClient, createAgentClient } from './agent/client'

let ACCESS_TOKEN = localStorage.getItem('accessToken')
if (!ACCESS_TOKEN) {
    ACCESS_TOKEN = window.prompt('Enter a Sourcegraph.com access token:')
    if (!ACCESS_TOKEN) {
        throw new Error('No access token provided')
    }
    localStorage.setItem('accessToken', ACCESS_TOKEN)
}

let CLIENT: Promise<AgentClient>
const onMessageCallbacks: ((message: ExtensionMessage) => void)[] = []
try {
    CLIENT = createAgentClient({
        serverEndpoint: 'https://sourcegraph.com',
        accessToken: ACCESS_TOKEN ?? '',
        workspaceRootUri: 'file:///tmp/foo',
    })
} catch (error) {
    console.error(error)
}

setDisplayPathEnvInfo({ isWindows: false, workspaceFolders: [URI.file('/tmp/foo')] })

// NOTE: This code is copied from the VS Code webview's App component and implements a subset of the
// functionality for the standalone web app prototype.
export const App: FunctionComponent = () => {
    const [isTranscriptError, setIsTranscriptError] = useState<boolean>(false)
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    const [transcript, setTranscript] = useState<ChatMessage[]>([])
    const [userAccountInfo, setUserAccountInfo] = useState<UserAccountInfo>()
    const [chatModels, setChatModels] = useState<ModelProvider[]>()

    const [client, setClient] = useState<AgentClient | Error | null>(null)
    useEffect(() => {
        ;(async () => {
            try {
                const client = await CLIENT
                setClient(client)
            } catch (error) {
                console.error(error)
                setClient(() => error as Error)
            }
        })()
    }, [])

    const vscodeAPI = useMemo<VSCodeWrapper>(() => {
        if (client && !isErrorLike(client)) {
            client.rpc.onNotification(
                'webview/postMessage',
                ({ id, message }: { id: string; message: ExtensionMessage }) => {
                    if (client.webviewPanelID === id) {
                        for (const callback of onMessageCallbacks) {
                            callback(hydrateAfterPostMessage(message, uri => URI.from(uri as any)))
                        }
                    }
                }
            )
        }

        return {
            postMessage: message => {
                if (client && !isErrorLike(client)) {
                    void client.rpc.sendRequest('webview/receiveMessage', {
                        id: client.webviewPanelID,
                        message,
                    })
                }
            },
            onMessage: callback => {
                if (client && !isErrorLike(client)) {
                    onMessageCallbacks.push(callback)
                    return () => {
                        // Remove callback from onMessageCallbacks.
                        const index = onMessageCallbacks.indexOf(callback)
                        if (index >= 0) {
                            onMessageCallbacks.splice(index, 1)
                        }
                    }
                }
                return () => {}
            },
            getState: () => {
                throw new Error('not implemented')
            },
            setState: () => {
                throw new Error('not implemented')
            },
        }
    }, [client])
    useEffect(() => {
        setVSCodeWrapper(vscodeAPI)
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
        (selected: ModelProvider): void => {
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

    return client && userAccountInfo && chatModels ? (
        isErrorLike(client) ? (
            <p>Error: {client.message}</p>
        ) : (
            <ChatModelContextProvider value={chatModelContext}>
                <TelemetryRecorderContext.Provider value={telemetryRecorder}>
                    <Chat
                        chatEnabled={true}
                        userInfo={userAccountInfo}
                        messageInProgress={messageInProgress}
                        transcript={transcript}
                        vscodeAPI={vscodeAPI}
                        telemetryService={telemetryService}
                        isTranscriptError={isTranscriptError}
                        userContextFromSelection={[]}
                    />
                </TelemetryRecorderContext.Provider>
            </ChatModelContextProvider>
        )
    ) : (
        <>Loading...</>
    )
}
