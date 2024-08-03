import {
    type ContextItem,
    ContextItemSource,
    type ContextItemTree,
    contextFiltersProvider,
    displayLineRange,
    displayPathBasename,
    expandToLineRange,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getSelectionOrFileContext } from '../commands/context/selection'
import { createRemoteRepositoryMention } from '../context/openctx/remoteRepositorySearch'
import type { RemoteSearch } from '../context/remote-search'
import type { ChatModel } from './chat-view/ChatModel'
import { contextItemMentionFromOpenCtxItem } from './context/chatContext'
import type { ExtensionMessage } from './protocol'

type PostMessage = (message: Extract<ExtensionMessage, { type: 'clientState' }>) => void

/**
 * Listen for changes to the client (such as VS Code) state to send to the webview.
 */
export function startClientStateBroadcaster({
    remoteSearch,
    postMessage: rawPostMessage,
    chatModel,
}: {
    remoteSearch: RemoteSearch | null
    postMessage: PostMessage
    chatModel: ChatModel
}): vscode.Disposable {
    const postMessage = idempotentPostMessage(rawPostMessage)

    async function rawSendClientState(signal: AbortSignal | null): Promise<void> {
        const items: ContextItem[] = []

        const corpusItems = getCorpusContextItemsForEditorState({ remoteSearch })
        items.push(...corpusItems)

        const { input, context } = chatModel.contextWindow
        const userContextSize = context?.user ?? input

        const [contextFile] = await getSelectionOrFileContext()
        signal?.throwIfAborted()
        if (contextFile) {
            const range = contextFile.range ? expandToLineRange(contextFile.range) : undefined
            const item = {
                ...contextFile,
                type: 'file',
                title: range ? 'Current Selection' : 'Current File',
                description: `${displayPathBasename(contextFile.uri)}${
                    range ? `:${displayLineRange(range)}` : ''
                }`,
                range,
                isTooLarge: contextFile.size !== undefined && contextFile.size > userContextSize,
                source: ContextItemSource.Initial,
                icon: range ? 'list-selection' : 'file',
            } satisfies ContextItem

            items.push(item)
        }

        postMessage({ type: 'clientState', value: { initialContext: items } })
    }

    const disposables: vscode.Disposable[] = []

    const sendClientState = debounced(rawSendClientState)
    disposables.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            // Relatively infrequent action, so don't debounce and show immediately in the UI.
            //
            // Here and in other invocations with 'immediate' still need to go through the debounced
            // function and should not call rawSendClientState directly to avoid a race condition
            // where a slow earlier call to rawSendClientState could call postMessage with stale
            // data.
            void sendClientState('immediate')
        }),
        vscode.window.onDidChangeTextEditorSelection(e => {
            // Frequent action, so debounce.
            void sendClientState('debounce')
        }),
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            // Infrequent action, so don't debounce and show immediately in the UI.
            void sendClientState('immediate')
        })
    )
    if (remoteSearch) {
        disposables.push(
            remoteSearch.onDidChangeStatus(() => {
                // Background action, so it's fine to debounce.
                void sendClientState('debounce')
            })
        )
    }

    // Don't debounce for the first invocation so we immediately reflect the state in the UI.
    void sendClientState('immediate')

    return vscode.Disposable.from(...disposables)
}

export function getCorpusContextItemsForEditorState({
    remoteSearch,
}: { remoteSearch: RemoteSearch | null }): ContextItem[] {
    const items: ContextItem[] = []

    // TODO(sqs): Make this consistent between self-serve (no remote search) and enterprise (has
    // remote search). There should be a single internal thing in Cody that lets you monitor the
    // user's current codebase.
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
            items.push({
                ...contextItemMentionFromOpenCtxItem(
                    createRemoteRepositoryMention({
                        id: repo.id,
                        name: repo.name,
                        url: repo.name,
                    })
                ),
                title: 'Current Repository',
                description: repo.name,
                source: ContextItemSource.Initial,
                icon: 'folder',
            })
        }
    } else {
        // TODO(sqs): Support multi-root. Right now, this only supports the 1st workspace root.
        const workspaceFolder = vscode.workspace.workspaceFolders?.at(0)
        if (workspaceFolder) {
            items.push({
                type: 'tree',
                uri: workspaceFolder.uri,
                title: 'Current Repository',
                name: workspaceFolder.name,
                description: workspaceFolder.name,
                isWorkspaceRoot: true,
                content: null,
                source: ContextItemSource.Initial,
                icon: 'folder',
            } satisfies ContextItemTree)
        }
    }

    return items
}

function idempotentPostMessage(rawPostMessage: PostMessage): PostMessage {
    let lastMessage: Parameters<typeof rawPostMessage>[0] | undefined
    const idempotentPostMessage: PostMessage = message => {
        const changed =
            lastMessage === undefined || JSON.stringify(message) !== JSON.stringify(lastMessage)
        if (changed) {
            lastMessage = message
            rawPostMessage(message)
        }
    }
    return idempotentPostMessage
}

function debounced(
    fn: (signal: AbortSignal) => Promise<void>
): (behavior: 'debounce' | 'immediate') => Promise<void> {
    // We can't just use lodash's debounce because we need to pass the `fn` an AbortSignal so it
    // knows when it has been canceled.

    const DEBOUNCE_DELAY = 200
    let timeoutId: NodeJS.Timeout | number | undefined = undefined
    let abortController: AbortController | undefined = undefined

    return async (behavior: 'debounce' | 'immediate'): Promise<void> => {
        if (timeoutId) {
            clearTimeout(timeoutId)
            if (abortController) {
                abortController.abort()
                abortController = undefined
            }
        }

        abortController = new AbortController()
        const signal = abortController.signal

        timeoutId = setTimeout(
            async () => {
                timeoutId = undefined
                try {
                    await fn(signal)
                } catch (error) {
                    if (error && (error as any).name !== 'AbortError') {
                        console.error('debounced function execution failed:', error)
                    }
                }
            },
            behavior === 'debounce' ? DEBOUNCE_DELAY : 0
        )
    }
}
