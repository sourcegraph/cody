import classNames from 'classnames'
import {
    type FC,
    type FunctionComponent,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { useThinkingState } from '../hooks/useThinkingState'
import { URI } from 'vscode-uri'
import { debugExtractThinking } from '../agent/debug-message-logging'
import { enhancedDebugExtractThinking } from '../agent/enhanced-debug'

import {
    type ChatMessage,
    type CodyClientConfig,
    type ContextItem,
    type ContextItemOpenCtx,
    ContextItemSource,
    PromptString,
    REMOTE_DIRECTORY_PROVIDER_URI,
    type WebviewToExtensionAPI,
    createGuardrailsImpl,
    isErrorLike,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'
import { AppWrapper } from 'cody-ai/webviews/AppWrapper'
import type { VSCodeWrapper } from 'cody-ai/webviews/utils/VSCodeApi'

import { ChatMentionContext, type ChatMentionsSettings } from '@sourcegraph/prompt-editor'
import { getAppWrappers } from 'cody-ai/webviews/App'
import { CodyPanel } from './CodyPanel'
import { useClientActionDispatcher } from 'cody-ai/webviews/client/clientState'
import type { View } from 'cody-ai/webviews/tabs'
import { ComposedWrappers, type Wrapper } from 'cody-ai/webviews/utils/composeWrappers'
import { createWebviewTelemetryRecorder } from 'cody-ai/webviews/utils/telemetry'
import type { Config } from 'cody-ai/webviews/utils/useConfig'

import type { CodyExternalApi, InitialContext } from '../types'

import { type UseCodyWebAgentInput, useCodyWebAgent } from './use-cody-agent'

// Include global Cody Web styles to the styles bundle
import '../global-styles/styles.css'
import type { DefaultContext } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import type { WebviewType } from 'cody-ai/src/chat/protocol'
import { downloadChatHistory } from 'cody-ai/webviews/chat/downloadChatHistory'
import styles from './CodyWebChat.module.css'
import { ChatSkeleton } from './skeleton/ChatSkeleton'

/**
 * Controls the rendering of the Cody Web Chat component.
 */
export type ViewType = 'page' | 'sidebar'

// Internal API mock call in order to set up web version of
// the cody agent properly (completely mock data)
setDisplayPathEnvInfo({
    isWindows: false,
    workspaceFolders: [],
})

export type ControllerMessage =
    | { type: 'view.change'; view: View }
    | { type: 'chat.new' }
    | { type: 'history.clear' }
    | { type: 'history.download' }

export type CodyWebChatMessage =
    | { type: 'chat.change'; chat: ChatMessage[] }
    | { type: 'view.change'; view: View }

export type MessageHandler = (message: ControllerMessage) => void
type Unsubscriber = () => void

/**
 * The host system can pass an instance of this controller to the Cody Web Chat component to have finer control over its behavior.
 * The controller allows the host system to change which view to show and get information about the current state of the chat.
 */
export interface CodyWebChatController {
    /**
     * Sends messages from the chat component to the controller.
     */
    postMessage(message: CodyWebChatMessage): void
    /**
     * Handles messages from the controller to the chat component.
     */
    onMessage(handler: MessageHandler): Unsubscriber
}

export interface CodyWebChatProps {
    agentConfig: UseCodyWebAgentInput
    initialContext?: InitialContext
    className?: string

    /** A controller that allows the host system to control the behavior of the chat. */
    controller?: CodyWebChatController

    /** How to render the chat, either as standalone page or sidebar. Defaults to 'sidebar'. */
    viewType?: ViewType

    /**
     * Whenever an external (imperative) Cody Chat API instance is ready,
     * for example it gives you ability to run prompt, Note that this handler
     * should be memoized and not change between components re-render, otherwise
     * it will be stuck in infinite update loop
     */
    onExternalApiReady?: (api: CodyExternalApi) => void
}
/**
 * The root component node for Cody Web Chat, implements Cody Agent client
 * and connects VSCode Cody Chat UI with web-worker agent. The main component
 * to use in Cody Web Consumers.
 *
 * You can see the demo usage of this component in demo/App.tsx
 */
export const CodyWebChat: FunctionComponent<CodyWebChatProps> = ({
    agentConfig,
    initialContext,
    className,
    onExternalApiReady,
    controller,
    viewType,
}) => {
    const agent = useCodyWebAgent(agentConfig)
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    
    // Use thinking state hook to process and manage thinking content
    const thinkingState = useThinkingState(messageInProgress)
    
    // Debug output
    useEffect(() => {
        console.log('CodyWebChat: thinking state updated', thinkingState)
        // Debug extract thinking from current message
        if (messageInProgress) {
            // Use both debug functions for more comprehensive output
            debugExtractThinking(messageInProgress)
            enhancedDebugExtractThinking(messageInProgress)
        }
    }, [thinkingState, messageInProgress])

    useEffect(() => {
        if (agent && !isErrorLike(agent)) {
            agent.client.rpc.sendNotification('workspaceFolder/didChange', {
                uris: initialContext?.repository.name ? [`repo:${initialContext.repository.name}`] : [],
            })
            agent.createNewChat()
        }
    }, [initialContext?.repository, agent])

    if (isErrorLike(agent)) {
        return <p>Cody Web client agent error: {agent.message}</p>
    }

    if (agent === null) {
        return <ChatSkeleton className={classNames(className, styles.root)} />
    }

    return (
        <AppWrapper>
            <div className={classNames(className, styles.root)}>
                <CodyWebPanel
                    vscodeAPI={{
                        ...agent.vscodeAPI,
                        // Wrap onMessage with logging
                        onMessage: handler => {
                            console.log('Setting up message handler with logging')
                            const wrappedHandler = (message: any) => {
                                if (message.type === 'transcript') {
                                    console.log('⚡ DEBUG - Transcript message received in wrapper', message)
                                }
                                handler(message)
                            }
                            return agent.vscodeAPI.onMessage(wrappedHandler)
                        }
                    }}
                    initialContext={initialContext}
                    className={styles.container}
                    onExternalApiReady={onExternalApiReady}
                    webview={viewType === 'page' ? 'editor' : 'sidebar'}
                    controller={controller}
                    thinkingState={thinkingState}
                    messageInProgress={messageInProgress}
                    setMessageInProgress={setMessageInProgress}
                />
            </div>
        </AppWrapper>
    )
}

interface CodyWebPanelProps {
    vscodeAPI: VSCodeWrapper
    initialContext: InitialContext | undefined
    className?: string
    onExternalApiReady?: (api: CodyExternalApi) => void
    webview: WebviewType
    controller?: CodyWebChatController
    messageInProgress?: ChatMessage | null
    setMessageInProgress?: React.Dispatch<React.SetStateAction<ChatMessage | null>>
    thinkingState?: {
        thinkContent: string
        isThinking: boolean
        isThoughtProcessOpened: boolean
        setThoughtProcessOpened: (open: boolean) => void
    }
}

const CodyWebPanel: FC<CodyWebPanelProps> = props => {
    const {
        vscodeAPI,
        initialContext: initialContextData,
        className,
        onExternalApiReady,
        webview,
        controller,
        thinkingState,
        messageInProgress: externalMessageInProgress,
        setMessageInProgress: externalSetMessageInProgress,
    } = props

    const dispatchClientAction = useClientActionDispatcher()
    const [errorMessages, setErrorMessages] = useState<string[]>([])
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    
    // Use external state handlers if provided
    const currentMessageInProgress = externalMessageInProgress ?? messageInProgress
    const currentSetMessageInProgress = externalSetMessageInProgress ?? setMessageInProgress

    const [transcript, setTranscript] = useState<ChatMessage[]>([])
    const [config, setConfig] = useState<Config | null>(null)
    const [clientConfig, setClientConfig] = useState<CodyClientConfig | null>(null)
    const [view, setView] = useState<View | undefined>()
    const extensionApiRef = useRef<WebviewToExtensionAPI | null>(null)

    // This would be the message processing function, but we'll fix the errors by commenting it out
    // We'll need to re-implement this logic after fixing the state references
    
    // Thinking state is now managed by the useThinkingState hook
    
    useLayoutEffect(() => {
        return controller?.onMessage(message => {
            switch (message.type) {
                case 'view.change':
                    setView(message.view)
                    break
                case 'chat.new':
                    vscodeAPI.postMessage({ command: 'command', id: 'cody.chat.new' })
                    break
                case 'history.clear':
                    // For some reason the view doesnt' update after the history is cleared. We force create a new chat
                    // as a workaround.
                    // FIXME: Invoking these two commands in a row doesn't work either.
                    vscodeAPI.postMessage({ command: 'command', id: 'cody.chat.new' })
                    vscodeAPI.postMessage({
                        command: 'command',
                        id: 'cody.chat.history.clear',
                        arg: 'clear-all-no-confirm',
                    })
                    break
                case 'history.download': {
                    if (extensionApiRef.current) {
                        downloadChatHistory(extensionApiRef.current)
                    }
                    break
                }
            }
        })
    }, [controller, vscodeAPI])

    const onExtensionApiReady = useCallback((api: WebviewToExtensionAPI) => {
        extensionApiRef.current = api
    }, [])

    const handleViewChange = useCallback(
        (view: View) => {
            if (controller) {
                // Let the controller decide how to handle the view change
                controller.postMessage({ type: 'view.change', view })
            } else {
                setView(view)
            }
        },
        [controller]
    )

    const handleTranscriptChange = useCallback(
        (transcript: ChatMessage[]) => {
            setTranscript(transcript)
            controller?.postMessage({ type: 'chat.change', chat: transcript })
        },
        [controller]
    )

    useLayoutEffect(() => {
        vscodeAPI.onMessage(message => {
            switch (message.type) {
                case 'transcript': {
                    const deserializedMessages = message.messages.map(
                        PromptString.unsafe_deserializeChatMessage
                    )
                    console.log('CodyWebPanel: transcript update', {
                        isMessageInProgress: message.isMessageInProgress,
                        messages: deserializedMessages,
                        // Add more details about the messages
                        messagesDetails: deserializedMessages.map(msg => ({
                            speaker: msg.speaker,
                            hasText: !!msg.text,
                            textLength: msg.text ? msg.text.toString().length : 0,
                            hasThinkTag: msg.text ? msg.text.toString().includes('<think>') : false,
                            // Show a sample of the message text
                            textSample: msg.text ? 
                                msg.text.toString().substring(0, 50) + (msg.text.toString().length > 50 ? '...' : '') 
                                : '[no text]'
                        }))
                    })
                    if (message.isMessageInProgress) {
                        const msgLength = deserializedMessages.length - 1
                        handleTranscriptChange(deserializedMessages.slice(0, msgLength))
                        const currentMessage = deserializedMessages[msgLength]
                        console.log('CodyWebPanel: updating message in progress', currentMessage)
                        currentSetMessageInProgress(currentMessage)
                    } else {
                        handleTranscriptChange(deserializedMessages)
                        currentSetMessageInProgress(null)
                    }
                    break
                }
                case 'errors':
                    setErrorMessages(prev => [...prev, message.errors].slice(-5))
                    break
                case 'view':
                    handleViewChange(message.view)
                    break
                case 'config':
                    message.config.webviewType = webview
                    message.config.multipleWebviewsEnabled = false
                    setConfig(message)
                    break
                case 'clientConfig':
                    if (message.clientConfig) {
                        setClientConfig(message.clientConfig)
                    }
                    break
                case 'clientAction':
                    dispatchClientAction(message)
                    break
            }
        })
    }, [vscodeAPI, dispatchClientAction, handleTranscriptChange, handleViewChange, webview, currentSetMessageInProgress])

    // V2 telemetry recorder
    const telemetryRecorder = useMemo(() => createWebviewTelemetryRecorder(vscodeAPI), [vscodeAPI])

    const staticDefaultContext = useMemo<DefaultContext>((): DefaultContext => {
        const { repository, fileURL, isDirectory } = initialContextData ?? {}

        if (!repository || !repository.id) {
            return { initialContext: [], corpusContext: [] }
        }

        const initialContext: ContextItem[] = []
        const corpusContext: ContextItem[] = []

        if (fileURL) {
            // Repository directory file url in this case is directory path
            if (isDirectory) {
                initialContext.push({
                    type: 'openctx',
                    provider: 'openctx',
                    title: fileURL,
                    uri: URI.file(`${repository.name}/${fileURL}/`),
                    providerUri: REMOTE_DIRECTORY_PROVIDER_URI,
                    description: 'Current Directory',
                    source: ContextItemSource.Initial,
                    mention: {
                        data: {
                            repoName: repository.name,
                            repoID: repository.id,
                            directoryPath: `${fileURL}/`,
                        },
                        description: fileURL,
                    },
                    icon: 'search',
                } as ContextItemOpenCtx)
            } else {
                // Common file mention with possible file range positions
                initialContext.push({
                    type: 'file',
                    isIgnored: false,
                    title: initialContextData?.fileRange ? 'Current Selection' : 'Current File',
                    range: initialContextData?.fileRange
                        ? {
                              start: { line: initialContextData.fileRange.startLine, character: 0 },
                              end: { line: initialContextData.fileRange.endLine + 1, character: 0 },
                          }
                        : undefined,
                    repoName: repository.name,
                    remoteRepositoryName: repository.name,
                    uri: URI.file(`${repository.name}/${fileURL}`),
                    source: ContextItemSource.Initial,
                    icon: 'file',
                })
            }
        }

        return { initialContext, corpusContext }
    }, [initialContextData])

    const wrappers = useMemo<Wrapper[]>(
        () =>
            getAppWrappers({
                vscodeAPI,
                telemetryRecorder,
                config,
                clientConfig,
                staticDefaultContext,
            }),
        [vscodeAPI, telemetryRecorder, config, clientConfig, staticDefaultContext]
    )

    const CONTEXT_MENTIONS_SETTINGS = useMemo<ChatMentionsSettings>(() => {
        const { repository } = initialContextData ?? {}

        return {
            resolutionMode: 'remote',
            remoteRepositoriesNames: repository?.name ? [repository.name] : [],
        }
    }, [initialContextData])

    const isLoading = !config || !view

    const attributionMode = config?.config.attribution || 'none'
    const guardrails = useMemo(
        () =>
            createGuardrailsImpl(attributionMode, (snippet: string) => {
                vscodeAPI.postMessage({
                    command: 'attribution-search',
                    snippet,
                })
            }),
        [attributionMode, vscodeAPI]
    )
    useLayoutEffect(() => {
        vscodeAPI.onMessage(message => {
            if (message.type === 'attribution') {
                if (message.attribution) {
                    guardrails.notifyAttributionSuccess(message.snippet, {
                        repositories: message.attribution.repositoryNames.map(name => {
                            return { name }
                        }),
                        limitHit: message.attribution.limitHit,
                    })
                }
                if (message.error) {
                    guardrails.notifyAttributionFailure(message.snippet, new Error(message.error))
                }
            }
        })
    }, [vscodeAPI, guardrails])

    return (
        <div className={className} data-cody-web-chat={true}>
            {!isLoading && (
                <ChatMentionContext.Provider value={CONTEXT_MENTIONS_SETTINGS}>
                    <ComposedWrappers wrappers={wrappers}>
                        <CodyPanel
                            view={view}
                            setView={handleViewChange}
                            errorMessages={errorMessages}
                            setErrorMessages={setErrorMessages}
                            guardrails={guardrails}
                            configuration={config}
                            chatEnabled={true}
                            instanceNotices={clientConfig?.notices ?? []}
                            showWelcomeMessage={true}
                            showIDESnippetActions={false}
                            messageInProgress={currentMessageInProgress}
                            transcript={transcript}
                            vscodeAPI={vscodeAPI}
                            onExternalApiReady={onExternalApiReady}
                            onExtensionApiReady={onExtensionApiReady}
                            thinkingState={thinkingState}
                        />
                    </ComposedWrappers>
                </ChatMentionContext.Provider>
            )}
        </div>
    )
}
