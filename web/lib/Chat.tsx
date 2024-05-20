import { URI } from 'vscode-uri'
import { type FC, useCallback, useEffect, useMemo, useState, useRef } from 'react'

import {
    type ChatMessage,
    type ModelProvider,
    PromptString,
    hydrateAfterPostMessage,
    isErrorLike,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'

import type { ExtensionMessage } from '@sourcegraph/vscode-cody/src/chat/protocol'
import { Chat, type UserAccountInfo } from '@sourcegraph/vscode-cody/webviews/Chat'
import {
    type ChatModelContext,
    ChatModelContextProvider,
} from '@sourcegraph/vscode-cody/webviews/chat/models/chatModelContext'
import { type VSCodeWrapper, setVSCodeWrapper } from '@sourcegraph/vscode-cody/webviews/utils/VSCodeApi'
import { createWebviewTelemetryRecorder, createWebviewTelemetryService } from '@sourcegraph/vscode-cody/webviews/utils/telemetry'

import { type AgentClient, createAgentClient } from './agent/client'

import './cody-web-chat.css'

// Internal API mock call in order to set up web version of
// the cody agent properly (completely mock data)
setDisplayPathEnvInfo({
    isWindows: false,
    workspaceFolders: [URI.file('/tmp/foo')]
})

export interface CodyWebChatProps {
    accessToken: string
    serverEndpoint: string
    className?: string
}

// NOTE: This code is copied from the VS Code webview's App component and implements a subset of the
// functionality for the experimental web chat prototype.
export const CodyWebChat: FC<CodyWebChatProps> = props => {
    const { accessToken, serverEndpoint, className } = props

    const onMessageCallbacksRef = useRef<((message: ExtensionMessage) => void)[]>([])

    const [client, setClient] = useState<AgentClient | Error | null>(null)
    const [isTranscriptError, setIsTranscriptError] = useState<boolean>(false)
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    const [transcript, setTranscript] = useState<ChatMessage[]>([])
    const [userAccountInfo, setUserAccountInfo] = useState<UserAccountInfo>()
    const [chatModels, setChatModels] = useState<ModelProvider[]>()

    useEffect(() => {
        ;(async () => {
            try {
                const client = await createAgentClient({
                    serverEndpoint: serverEndpoint,
                    accessToken: accessToken ?? '',
                    workspaceRootUri: 'file:///tmp/foo',
                })

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
                        for (const callback of onMessageCallbacksRef.current) {
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
                    onMessageCallbacksRef.current.push(callback)
                    return () => {
                        // Remove callback from onMessageCallbacks.
                        const index = onMessageCallbacksRef.current.indexOf(callback)
                        if (index >= 0) {
                            onMessageCallbacksRef.current.splice(index, 1)
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

    return (
        <div className={className} data-cody-web-chat={true}>
            {client && userAccountInfo && chatModels ? (
                isErrorLike(client) ? (
                    <p>Error: {client.message}</p>
                ) : (
                    <ChatModelContextProvider value={chatModelContext}>
                        <Chat
                            chatEnabled={true}
                            userInfo={userAccountInfo}
                            messageInProgress={messageInProgress}
                            transcript={transcript}
                            vscodeAPI={vscodeAPI}
                            telemetryService={telemetryService}
                            telemetryRecorder={telemetryRecorder}
                            isTranscriptError={isTranscriptError}
                            chatIDHistory={[]}
                            userContextFromSelection={[]}
                            isWebviewActive={true}
                            isNewInstall={false}
                        />
                    </ChatModelContextProvider>
                )
            ) : (
                <>Loading...</>
            )}
        </div>
    )
}
