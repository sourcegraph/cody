import {
    type ChatMessage,
    type Client,
    type ExtHostAPI,
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
import { getVSCodeAPI, setVSCodeWrapper } from '../../vscode/webviews/utils/VSCodeApi'
import { ExtHostClientContext, createExtHostClient } from '../../vscode/webviews/utils/extHostClient'
import {
    createWebviewTelemetryRecorder,
    createWebviewTelemetryService,
} from '../../vscode/webviews/utils/telemetry'
import styles from './App.module.css'
import { createAgentClient, initializeAgentClient } from './agent/client'

let ACCESS_TOKEN = localStorage.getItem('accessToken')
if (!ACCESS_TOKEN) {
    ACCESS_TOKEN = window.prompt('Enter a Sourcegraph.com access token:')
    if (!ACCESS_TOKEN) {
        throw new Error('No access token provided')
    }
    localStorage.setItem('accessToken', ACCESS_TOKEN)
}

const client = createAgentClient()
let webviewPanelID: string
initializeAgentClient(client, {
    serverEndpoint: 'https://sourcegraph.com',
    accessToken: ACCESS_TOKEN ?? '',
    workspaceRootUri: 'file:///tmp/foo',
})
    .then(result => {
        webviewPanelID = result.webviewPanelID
    })
    .catch(console.error)

const onMessageCallbacks: ((message: ExtensionMessage) => void)[] = []
client.rpc.onNotification(
    'webview/postMessage',
    ({ id, message }: { id: string; message: ExtensionMessage }) => {
        if (webviewPanelID === id) {
            for (const callback of onMessageCallbacks) {
                callback(hydrateAfterPostMessage(message, uri => URI.from(uri as any)))
            }
        }
    }
)
setVSCodeWrapper({
    postMessage: message => {
        void client.rpc.sendRequest('webview/receiveMessage', {
            id: webviewPanelID,
            message,
        })
    },
    onMessage: callback => {
        onMessageCallbacks.push(callback)
        return () => {
            // Remove callback from onMessageCallbacks.
            const index = onMessageCallbacks.indexOf(callback)
            if (index >= 0) {
                onMessageCallbacks.splice(index, 1)
            }
        }
    },
    getState: () => {
        throw new Error('not implemented')
    },
    setState: () => {
        throw new Error('not implemented')
    },
})
const vscodeAPI = getVSCodeAPI()

setDisplayPathEnvInfo({ isWindows: false, workspaceFolders: [URI.file('/tmp/foo')] })

// NOTE: This code is copied from the VS Code webview's App component and implements a subset of the
// functionality for the standalone web app prototype.
export const App: FunctionComponent = () => {
    const [isTranscriptError, setIsTranscriptError] = useState<boolean>(false)
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    const [transcript, setTranscript] = useState<ChatMessage[]>([])
    const [userAccountInfo, setUserAccountInfo] = useState<UserAccountInfo>()
    const [chatModels, setChatModels] = useState<ModelProvider[]>()

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
                default:
                    console.error('unknown message type', message)
                    break
            }
        })
        vscodeAPI.postMessage({ command: 'ready' })
    }, [])
    const extHostClient = useMemo<Client<ExtHostAPI>>(
        () => createExtHostClient({ postMessage: vscodeAPI.postMessage }),
        []
    )

    // Deprecated V1 telemetry
    const telemetryService = useMemo(() => createWebviewTelemetryService(vscodeAPI), [])
    // V2 telemetry recorder
    const telemetryRecorder = useMemo(() => createWebviewTelemetryRecorder(vscodeAPI), [])

    const onCurrentChatModelChange = useCallback(
        (selected: ModelProvider): void => {
            if (!chatModels || !setChatModels) {
                return
            }
            vscodeAPI?.postMessage({
                command: 'chatModel',
                model: selected.model,
            })
            const updatedChatModels = chatModels.map(m =>
                m.model === selected.model ? { ...m, default: true } : { ...m, default: false }
            )
            setChatModels(updatedChatModels)
        },
        [chatModels]
    )
    const chatModelContext = useMemo<ChatModelContext>(
        () => ({ chatModels, onCurrentChatModelChange }),
        [chatModels, onCurrentChatModelChange]
    )

    return (
        <div className={styles.container}>
            {client && userAccountInfo && chatModels ? (
                isErrorLike(client) ? (
                    <p>Error: {client.message}</p>
                ) : (
                    <ChatModelContextProvider value={chatModelContext}>
                        <ExtHostClientContext.Provider value={extHostClient}>
                            <Chat
                                chatEnabled={true}
                                userInfo={userAccountInfo}
                                messageInProgress={messageInProgress}
                                transcript={transcript}
                                vscodeAPI={vscodeAPI}
                                telemetryService={telemetryService}
                                telemetryRecorder={telemetryRecorder}
                                isTranscriptError={isTranscriptError}
                                userContextFromSelection={[]}
                                isNewInstall={false}
                            />
                        </ExtHostClientContext.Provider>
                    </ChatModelContextProvider>
                )
            ) : (
                <>Loading...</>
            )}
        </div>
    )
}
