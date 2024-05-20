import {
    type ChatMessage,
    type ModelProvider,
    PromptString,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'
import { type FunctionComponent, useCallback, useEffect, useMemo, useState } from 'react'
import { URI } from 'vscode-uri'
import { Chat, type UserAccountInfo } from '../../vscode/webviews/Chat'
import {
    type ChatModelContext,
    ChatModelContextProvider,
} from '../../vscode/webviews/chat/models/chatModelContext'
import { getVSCodeAPI } from '../../vscode/webviews/utils/VSCodeApi'
import { ExtHostClientContext, createExtHostClient } from '../../vscode/webviews/utils/extHostClient'
import {
    createWebviewTelemetryRecorder,
    createWebviewTelemetryService,
} from '../../vscode/webviews/utils/telemetry'
import styles from './App.module.css'
import { createAgentClient } from './agent/client'

createAgentClient()
const vscodeAPI = getVSCodeAPI()
const extHostClient = createExtHostClient(vscodeAPI)

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
            if ('jsonrpc' in message) {
                return // ignore messages from the new JSON-RPC protocol
            }
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
                    break
            }
        })
        vscodeAPI.postMessage({ command: 'ready' })
    }, [])

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
            {userAccountInfo && chatModels ? (
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
            ) : (
                <>Loading...</>
            )}
        </div>
    )
}
