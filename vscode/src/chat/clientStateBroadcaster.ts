import {
    type ContextItem,
    ContextItemSource,
    type ContextItemTree,
    contextFiltersProvider,
    isMultiLineRange,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getContextFileFromSelection } from '../commands/context/selection'
import { createRemoteRepositoryMention } from '../context/openctx/remoteRepositorySearch'
import type { RemoteSearch } from '../context/remote-search'
import { contextItemMentionFromOpenCtxItem } from './context/chatContext'
import type { ExtensionMessage } from './protocol'

type PostMessage = (message: Extract<ExtensionMessage, { type: 'clientState' }>) => void

/**
 * Listen for changes to the client (such as VS Code) state to send to the webview.
 */
export function startClientStateBroadcaster({
    remoteSearch,
    postMessage: rawPostMessage,
}: {
    remoteSearch: RemoteSearch | null
    postMessage: PostMessage
}): vscode.Disposable {
    const postMessage = debouncedIdempotentPostMessage(rawPostMessage)

    async function sendClientState(): Promise<void> {
        const items: ContextItem[] = []
        const availableEditorContext: ContextItem[] = []

        // TODO(sqs): Make this consistent between self-serve (no remote search) and enterprise (has
        // remote search).
        if (remoteSearch) {
            // TODO(sqs): Track the last-used repositories. Right now it just uses the current
            // repository.
            //
            // Make a repository item that is the same as what the @-repository OpenCtx provider
            // would return.
            const repos = remoteSearch.getRepos('all')
            for (const repo of repos) {
                if (contextFiltersProvider.isRepoNameIgnored(repo.name)) {
                    continue
                }

                const item = {
                    ...contextItemMentionFromOpenCtxItem(
                        createRemoteRepositoryMention({
                            id: repo.id,
                            name: repo.name,
                            url: `repo:${repo.name}`,
                        })
                    ),
                    source: ContextItemSource.Initial,
                    description: 'Entire codebase context',
                }

                items.push(item)
                availableEditorContext.push(item)
            }
        } else {
            // TODO(sqs): Support multi-root. Right now, this only supports the 1st workspace root.
            const workspaceFolder = vscode.workspace.workspaceFolders?.at(0)
            if (workspaceFolder) {
                const item = {
                    type: 'tree',
                    uri: workspaceFolder.uri,
                    title: workspaceFolder.name,
                    isWorkspaceRoot: true,
                    content: null,
                    source: ContextItemSource.Initial,
                    description: 'Entire codebase context',
                } satisfies ContextItemTree

                items.push(item)
                availableEditorContext.push(item)
            }
        }
        ;(await getContextFileFromSelection()).map(contextFile => {
            const item = {
                ...contextFile,
                type: 'file',
                range:
                    contextFile.range && isMultiLineRange(contextFile.range)
                        ? contextFile.range
                        : undefined,
                source: ContextItemSource.Initial,
            } satisfies ContextItem

            items.push(item)
            availableEditorContext.push(item)

            if (item.range) {
                // also include the compelte file as a context item
                availableEditorContext.push({
                    ...item,
                    range: undefined,
                })
            }
        })

        postMessage({ type: 'clientState', value: { initialContext: items, availableEditorContext } })
    }

    const disposables: vscode.Disposable[] = []

    disposables.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            void sendClientState()
        }),
        vscode.window.onDidChangeTextEditorSelection(() => {
            void sendClientState()
        }),
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            void sendClientState()
        })
    )
    if (remoteSearch) {
        disposables.push(
            remoteSearch.onDidChangeStatus(() => {
                void sendClientState()
            })
        )
    }

    void sendClientState()

    return vscode.Disposable.from(...disposables)
}

function debouncedIdempotentPostMessage(rawPostMessage: PostMessage): PostMessage {
    let lastMessage: Parameters<typeof rawPostMessage>[0] | undefined
    const idempotentPostMessage: PostMessage = message => {
        const changed =
            lastMessage === undefined || JSON.stringify(message) !== JSON.stringify(lastMessage)
        if (changed) {
            lastMessage = message
            rawPostMessage(message)
        }
    }

    let lastTimeoutHandle: number | NodeJS.Timeout | undefined
    let nextMessage: Parameters<typeof rawPostMessage>[0] | undefined
    const debouncedPostMessage: PostMessage = message => {
        nextMessage = message
        if (lastTimeoutHandle !== undefined) {
            return
        }
        lastTimeoutHandle = setTimeout(() => {
            clearTimeout(lastTimeoutHandle)
            lastTimeoutHandle = undefined
            idempotentPostMessage(nextMessage!)
        }, 200)
    }

    return debouncedPostMessage
}
