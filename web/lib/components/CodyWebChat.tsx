import { type FC, type FunctionComponent, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { URI } from 'vscode-uri'

import {
    type ContextItem,
    type ContextItemOpenCtx,
    type ContextItemRepository,
    ContextItemSource,
    REMOTE_DIRECTORY_PROVIDER_URI,
    isErrorLike,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'
import { AppWrapper } from 'cody-ai/webviews/AppWrapper'
import type { VSCodeWrapper } from 'cody-ai/webviews/utils/VSCodeApi'

import { ChatMentionContext, type ChatMentionsSettings } from '@sourcegraph/prompt-editor'
import { getAppWrappers } from 'cody-ai/webviews/App'
import { CodyPanel } from 'cody-ai/webviews/CodyPanel'
import { View } from 'cody-ai/webviews/tabs'
import { ComposedWrappers, type Wrapper } from 'cody-ai/webviews/utils/composeWrappers'

import type { InitialContext } from '../types'

import { useCodyWebAgent } from './use-cody-agent'

// Include global Cody Web styles to the styles bundle
import '../global-styles/styles.css'
import { ChatSkeleton } from './skeleton/ChatSkeleton'

// Internal API mock call in order to set up web version of
// the cody agent properly (completely mock data)
setDisplayPathEnvInfo({
    isWindows: false,
    workspaceFolders: [URI.file('/tmp/foo')],
})

export interface CodyWebChatProps {
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
    createAgentWorker,
    initialContext,
    telemetryClientName,
    customHeaders,
    className,
}) => {
    const { client, vscodeAPI, panelId } = useCodyWebAgent({
        createAgentWorker,
        initialContext,
        telemetryClientName,
        customHeaders,
    })

    if (isErrorLike(client)) {
        return <p>Cody Web client agent error: {client.message}</p>
    }

    if (client === null || vscodeAPI === null || panelId === null) {
        return <ChatSkeleton className={className} />
    }

    return (
        <AppWrapper>
            <CodyWebPanel vscodeAPI={vscodeAPI} initialContext={initialContext} />
        </AppWrapper>
    )
}

interface CodyWebPanelProps {
    vscodeAPI: VSCodeWrapper
    initialContext: InitialContext | undefined
}

const CodyWebPanel: FC<CodyWebPanelProps> = props => {
    const { vscodeAPI, initialContext: initialContextData } = props

    const [view, setView] = useState<View | undefined>()

    useLayoutEffect(() => {
        vscodeAPI.onMessage(message => {
            switch (message.type) {
                case 'view':
                    setView(message.view)
                    break
            }
        })
    }, [vscodeAPI])

    useEffect(() => {
        vscodeAPI.postMessage({ command: 'initialized' })
    }, [vscodeAPI])

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
        () => getAppWrappers(vscodeAPI, initialContext),
        [vscodeAPI, initialContext]
    )

    const CONTEXT_MENTIONS_SETTINGS = useMemo<ChatMentionsSettings>(() => {
        const { repository } = initialContextData ?? {}

        return {
            resolutionMode: 'remote',
            remoteRepositoriesNames: repository?.name ? [repository.name] : [],
        }
    }, [initialContextData])

    return (
        <ChatMentionContext.Provider value={CONTEXT_MENTIONS_SETTINGS}>
            <ComposedWrappers wrappers={wrappers}>
                <CodyPanel
                    view={view ?? View.Chat}
                    setView={setView}
                    showWelcomeMessage={true}
                    showIDESnippetActions={false}
                    vscodeAPI={vscodeAPI}
                    data-cody-web-chat={true}
                />
            </ComposedWrappers>
        </ChatMentionContext.Provider>
    )
}
