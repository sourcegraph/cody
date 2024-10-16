import classNames from 'classnames'
import { type FC, type FunctionComponent, useLayoutEffect, useMemo, useState } from 'react'
import { URI } from 'vscode-uri'

import {
    type ChatMessage,
    type ContextItem,
    type ContextItemOpenCtx,
    type ContextItemRepository,
    ContextItemSource,
    PromptString,
    REMOTE_DIRECTORY_PROVIDER_URI,
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

import type { InitialContext } from '../types'

import { useCodyWebAgent } from './use-cody-agent'

// Include global Cody Web styles to the styles bundle
import '../global-styles/styles.css'
import styles from './CodyWebChat.module.css'
import { ChatSkeleton } from './skeleton/ChatSkeleton'

// Internal API mock call in order to set up web version of
// the cody agent properly (completely mock data)
setDisplayPathEnvInfo({
    isWindows: false,
    workspaceFolders: [URI.file('/tmp/foo')],
})

export interface CodyWebChatProps {
    serverEndpoint: string
    accessToken: string | null
    createAgentWorker: () => Worker
    telemetryClientName?: string
    initialContext?: InitialContext
    customHeaders?: Record<string, string>
    className?: string
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
                />
            </div>
        </AppWrapper>
    )
}

interface CodyWebPanelProps {
    vscodeAPI: VSCodeWrapper
    initialContext: InitialContext | undefined
    className?: string
}

const CodyWebPanel: FC<CodyWebPanelProps> = props => {
    const { vscodeAPI, initialContext: initialContextData, className } = props

    const dispatchClientAction = useClientActionDispatcher()
    const [errorMessages, setErrorMessages] = useState<string[]>([])
    const [messageInProgress, setMessageInProgress] = useState<ChatMessage | null>(null)
    const [transcript, setTranscript] = useState<ChatMessage[]>([])
    const [config, setConfig] = useState<Config | null>(null)
    const [view, setView] = useState<View | undefined>()

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
                    } else {
                        setTranscript(deserializedMessages)
                        setMessageInProgress(null)
                    }
                    break
                }
                case 'errors':
                    setErrorMessages(prev => [...prev, message.errors].slice(-5))
                    break
                case 'view':
                    setView(message.view)
                    break
                case 'config':
                    message.config.webviewType = 'sidebar'
                    message.config.multipleWebviewsEnabled = false
                    setConfig(message)
                    break
                case 'clientAction':
                    dispatchClientAction(message)
                    break
            }
        })
    }, [vscodeAPI, dispatchClientAction])

    // V2 telemetry recorder
    const telemetryRecorder = useMemo(() => createWebviewTelemetryRecorder(vscodeAPI), [vscodeAPI])

    const initialContext = useMemo<ContextItem[]>(() => {
        const { repository, fileURL, isDirectory } = initialContextData ?? {}

        if (!repository) {
            return []
        }

        const mentions: ContextItem[] = [
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
                title: 'Current Repository',
            } as ContextItemRepository,
        ]

        if (fileURL) {
            // Repository directory file url in this case is directory path
            if (isDirectory) {
                mentions.push({
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
                } as ContextItemOpenCtx)
            } else {
                // Common file mention with possible file range positions
                mentions.push({
                    type: 'file',
                    title: initialContextData?.fileRange ? 'Current Selection' : 'Current File',
                    isIgnored: false,
                    range: initialContextData?.fileRange
                        ? {
                              start: { line: initialContextData.fileRange.startLine, character: 0 },
                              end: { line: initialContextData.fileRange.endLine + 1, character: 0 },
                          }
                        : undefined,
                    remoteRepositoryName: repository.name,
                    uri: URI.file(`${repository.name}/${fileURL}`),
                    source: ContextItemSource.Initial,
                })
            }
        }

        return mentions
    }, [initialContextData])

    const wrappers = useMemo<Wrapper[]>(
        () => getAppWrappers(vscodeAPI, telemetryRecorder, config, initialContext),
        [vscodeAPI, telemetryRecorder, config, initialContext]
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
                            setView={setView}
                            errorMessages={errorMessages}
                            setErrorMessages={setErrorMessages}
                            attributionEnabled={false}
                            configuration={config}
                            chatEnabled={true}
                            showWelcomeMessage={true}
                            showIDESnippetActions={false}
                            messageInProgress={messageInProgress}
                            transcript={transcript}
                            vscodeAPI={vscodeAPI}
                        />
                    </ComposedWrappers>
                </ChatMentionContext.Provider>
            )}
        </div>
    )
}
