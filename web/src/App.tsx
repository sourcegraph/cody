import {
    type ChatMessage,
    type ModelProvider,
    NOOP_TELEMETRY_SERVICE,
    hydrateAfterPostMessage,
    isErrorLike,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Chat } from '../../vscode/webviews/Chat'
import { Settings } from './settings/Settings'
import { useConfig } from './settings/useConfig'

import { URI } from 'vscode-uri'
import type { ExtensionMessage } from '../../vscode/src/chat/protocol'
import { type VSCodeWrapper, setVSCodeWrapper } from '../../vscode/webviews/utils/VSCodeApi'
import styles from './App.module.css'
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

export const App: React.FunctionComponent = () => {
    const [config, setConfig] = useConfig()
    const [isTranscriptError, setIsTranscriptError] = useState<boolean>(false)
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    const [transcript, setTranscript] = useState<ChatMessage[]>([])
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
                    // TODO(sqs): copied from webviews/App.tsx
                    if (message.isMessageInProgress) {
                        const msgLength = message.messages.length - 1
                        setTranscript(message.messages.slice(0, msgLength))
                        setMessageInProgress(message.messages[msgLength])
                        setIsTranscriptError(false)
                    } else {
                        setTranscript(message.messages)
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
            }
        })
    }, [vscodeAPI])
    useEffect(() => {
        // Notify the extension host that we are ready to receive events
        vscodeAPI.postMessage({ command: 'ready' })
    }, [vscodeAPI])

    return (
        <div className={styles.container}>
            <header className={styles.header} style={{ display: 'none' }}>
                <h1>Cody</h1>
                <Settings config={config} setConfig={setConfig} />
            </header>
            <main className={styles.main}>
                {client ? (
                    isErrorLike(client) ? (
                        <p>Error: {client.message}</p>
                    ) : (
                        <Chat
                            chatEnabled={true}
                            userInfo={{ isCodyProUser: true, isDotComUser: true }}
                            messageInProgress={messageInProgress}
                            transcript={transcript}
                            vscodeAPI={vscodeAPI}
                            telemetryService={NOOP_TELEMETRY_SERVICE /* TODO(sqs): add telemetry */}
                            isTranscriptError={isTranscriptError}
                            chatModels={chatModels}
                            setChatModels={setChatModels}
                            chatIDHistory={[]}
                            isWebviewActive={true}
                            isNewInstall={false}
                        />
                    )
                ) : (
                    <>Loading...</>
                )}
            </main>
        </div>
    )
}
