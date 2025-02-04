import classNames from 'classnames'
import {
    type FC,
    type FunctionComponent,
    useCallback,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { URI } from 'vscode-uri'

import {
    type ChatMessage,
    type CodyClientConfig,
    type ContextItem,
    type ContextItemOpenCtx,
    type ContextItemRepository,
    ContextItemSource,
    PromptString,
    REMOTE_DIRECTORY_PROVIDER_URI,
    type WebviewToExtensionAPI,
    isErrorLike,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'
import { AppWrapper } from 'cody-ai/webviews/AppWrapper'
import type { VSCodeWrapper } from 'cody-ai/webviews/utils/VSCodeApi'

import { ChatMentionContext, type ChatMentionsSettings } from '@sourcegraph/prompt-editor'
import { getAppWrappers } from 'cody-ai/webviews/App'
import { CodyPanel } from 'cody-ai/webviews/CodyPanel'
import { useClientActionDispatcher } from 'cody-ai/webviews/client/clientState'
import type { View } from 'cody-ai/webviews/tabs'
import { ComposedWrappers, type Wrapper } from 'cody-ai/webviews/utils/composeWrappers'
import { createWebviewTelemetryRecorder } from 'cody-ai/webviews/utils/telemetry'
import type { Config } from 'cody-ai/webviews/utils/useConfig'

import type { CodyExternalApi, InitialContext } from '../types'

import { useCodyWebAgent } from './use-cody-agent'

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
export type Unsubscriber = () => void

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
    serverEndpoint: string
    accessToken: string | null
    createAgentWorker: () => Worker
    telemetryClientName?: string
    initialContext?: InitialContext
    customHeaders?: Record<string, string>
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
    serverEndpoint,
    accessToken,
    createAgentWorker,
    initialContext,
    telemetryClientName,
    customHeaders,
    className,
    onExternalApiReady,
    controller,
    viewType,
}) => {
    const { client, vscodeAPI } = useCodyWebAgent({
        serverEndpoint,
        accessToken,
        createAgentWorker,
        initialContext,
        telemetryClientName,
        customHeaders,
    })

    if (isErrorLike(client)) {
        return <p>Cody Web client agent error: {client.message}</p>
    }

    if (client === null || vscodeAPI === null) {
        return <ChatSkeleton className={classNames(className, styles.root)} />
    }

    return (
        <AppWrapper>
            <div className={classNames(className, styles.root)}>
                <CodyWebPanel
                    vscodeAPI={vscodeAPI}
                    initialContext={initialContext}
                    className={styles.container}
                    onExternalApiReady={onExternalApiReady}
                    webview={viewType === 'page' ? 'editor' : 'sidebar'}
                    controller={controller}
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
}

const CodyWebPanel: FC<CodyWebPanelProps> = props => {
    const {
        vscodeAPI,
        initialContext: initialContextData,
        className,
        onExternalApiReady,
        webview,
        controller,
    } = props

    const dispatchClientAction = useClientActionDispatcher()
    const [errorMessages, setErrorMessages] = useState<string[]>([])
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    const [transcript, setTranscript] = useState<ChatMessage[]>([])
    const [config, setConfig] = useState<Config | null>(null)
    const [clientConfig, setClientConfig] = useState<CodyClientConfig | null>(null)
    const [view, setView] = useState<View | undefined>()
    const extensionApiRef = useRef<WebviewToExtensionAPI | null>(null)

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
                    console.log('codywebchat', {message: deserializedMessages[deserializedMessages.length-1].text?.length, deserializedMessages})
                    if (message.isMessageInProgress) {
                        const msgLength = deserializedMessages.length - 1
                        handleTranscriptChange(deserializedMessages.slice(0, msgLength))
                        setMessageInProgress(deserializedMessages[msgLength])
                    } else {
                        handleTranscriptChange(deserializedMessages)
                        setMessageInProgress(null)
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
    }, [vscodeAPI, dispatchClientAction, handleTranscriptChange, handleViewChange, webview])

    // V2 telemetry recorder
    const telemetryRecorder = useMemo(() => createWebviewTelemetryRecorder(vscodeAPI), [vscodeAPI])

    const staticDefaultContext = useMemo<DefaultContext>((): DefaultContext => {
        const { repository, fileURL, isDirectory } = initialContextData ?? {}

        if (!repository) {
            return { initialContext: [], corpusContext: [] }
        }

        const initialContext: ContextItem[] = []
        const corpusContext: ContextItem[] = [
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
                title: 'Current Repository', // web chat default initial context
            } as ContextItemRepository,
        ]

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
                    icon: 'git-folder',
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
                            attributionEnabled={false}
                            configuration={config}
                            chatEnabled={true}
                            instanceNotices={clientConfig?.notices ?? []}
                            showWelcomeMessage={true}
                            showIDESnippetActions={false}
                            messageInProgress={messageInProgress}
                            transcript={transcript}
                            vscodeAPI={vscodeAPI}
                            onExternalApiReady={onExternalApiReady}
                            onExtensionApiReady={onExtensionApiReady}
                        />
                    </ComposedWrappers>
                </ChatMentionContext.Provider>
            )}
        </div>
    )
}
