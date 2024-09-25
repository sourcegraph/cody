import {
    type ContextItem,
    type ContextItemOpenCtx,
    ContextItemSource,
    type ContextItemTree,
    REMOTE_REPOSITORY_PROVIDER_URI,
    authStatus,
    combineLatest,
    contextFiltersProvider,
    currentAuthStatusOrNotReadyYet,
    currentResolvedConfig,
    debounceTime,
    displayLineRange,
    displayPathBasename,
    expandToLineRange,
    firstResultFromOperation,
    modelsService,
    openCtx,
    resolvedConfig,
    subscriptionDisposable,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import { getSelectionOrFileContext } from '../commands/context/selection'
import { createRepositoryMention } from '../context/openctx/common/get-repository-mentions'
import { workspaceReposMonitor } from '../repository/repo-metadata-from-git-api'
import { ChatBuilder } from './chat-view/ChatBuilder'
import {
    contextItemMentionFromOpenCtxItem,
    getActiveEditorContextForOpenCtxMentions,
} from './context/chatContext'
import type { ExtensionMessage } from './protocol'

type PostMessage = (message: Extract<ExtensionMessage, { type: 'clientState' }>) => void

/**
 * Listen for changes to the client (such as VS Code) state to send to the webview.
 */
export function startClientStateBroadcaster({
    useRemoteSearch,
    postMessage: rawPostMessage,
    chatModel: chatBuilder,
}: {
    useRemoteSearch: boolean
    postMessage: PostMessage
    chatModel: ChatBuilder
}): vscode.Disposable {
    const postMessage = idempotentPostMessage(rawPostMessage)

    async function rawSendClientState(signal: AbortSignal | null): Promise<void> {
        // Don't bother doing anything if we haven't loaded any models yet.
        if (!currentAuthStatusOrNotReadyYet()?.authenticated || modelsService.models.length === 0) {
            return
        }

        const items: ContextItem[] = []

        const { input, context } = await firstResultFromOperation(
            ChatBuilder.contextWindowForChat(chatBuilder)
        )
        const userContextSize = context?.user ?? input

        const [contextFile] = await getSelectionOrFileContext()
        signal?.throwIfAborted()
        if (contextFile) {
            const range = contextFile.range ? expandToLineRange(contextFile.range) : undefined

            // Always add the current file item
            items.push({
                ...contextFile,
                type: 'file',
                title: 'Current File',
                description: displayPathBasename(contextFile.uri),
                range: undefined,
                isTooLarge: contextFile.size !== undefined && contextFile.size > userContextSize,
                source: ContextItemSource.Initial,
                icon: 'file',
            })

            // Add the current selection item if there's a range
            if (range) {
                items.push({
                    ...contextFile,
                    type: 'file',
                    title: 'Current Selection',
                    description: `${displayPathBasename(contextFile.uri)}:${displayLineRange(range)}`,
                    range,
                    isTooLarge: contextFile.size !== undefined && contextFile.size > userContextSize,
                    source: ContextItemSource.Initial,
                    icon: 'list-selection',
                })
            }
        }
        const corpusItems = getCorpusContextItemsForEditorState(useRemoteSearch)
        items.push(...(await corpusItems))

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
            // Don't trigger for output channel logs.
            if (e.textEditor.document.uri.scheme !== 'output') {
                // Frequent action, so debounce.
                void sendClientState('debounce')
            }
        }),
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            // Infrequent action, so don't debounce and show immediately in the UI.
            void sendClientState('immediate')
        })
    )
    disposables.push(
        subscriptionDisposable(
            combineLatest([
                resolvedConfig,
                authStatus,
                contextFiltersProvider.changes,
                modelsService.modelsChanges,
            ])
                .pipe(debounceTime(500))
                .subscribe(async () => {
                    // Infrequent action, so don't debounce and show immediately in the UI.
                    void sendClientState('immediate')
                })
        )
    )

    // Don't debounce for the first invocation so we immediately reflect the state in the UI.
    void sendClientState('immediate')

    return vscode.Disposable.from(...disposables)
}

export async function getCodebaseContextItemsForEditorState(
    useRemote: boolean
): Promise<ContextItem | undefined> {
    // TODO(sqs): Make this consistent between self-serve (no remote search) and enterprise (has
    // remote search). There should be a single internal thing in Cody that lets you monitor the
    // user's current codebase.
    if (useRemote && workspaceReposMonitor) {
        const { auth } = await currentResolvedConfig()
        const repoMetadata = await workspaceReposMonitor.getRepoMetadata()
        for (const repo of repoMetadata) {
            if (await contextFiltersProvider.isRepoNameIgnored(repo.repoName)) {
                continue
            }
            if (repo.remoteID === undefined) {
                continue
            }
            return {
                ...contextItemMentionFromOpenCtxItem(
                    await createRepositoryMention(
                        {
                            id: repo.remoteID,
                            name: repo.repoName,
                            url: repo.repoName,
                        },
                        REMOTE_REPOSITORY_PROVIDER_URI,
                        auth
                    )
                ),
                title: 'Current Repository',
                description: repo.repoName,
                source: ContextItemSource.Initial,
                icon: 'folder',
            }
        }
    } else {
        // TODO(sqs): Support multi-root. Right now, this only supports the 1st workspace root.
        const workspaceFolder = vscode.workspace.workspaceFolders?.at(0)
        if (workspaceFolder) {
            return {
                type: 'tree',
                uri: workspaceFolder.uri,
                title: 'Current Repository',
                name: workspaceFolder.name,
                description: workspaceFolder.name,
                isWorkspaceRoot: true,
                content: null,
                source: ContextItemSource.Initial,
                icon: 'folder',
            } satisfies ContextItemTree
        }
    }
    return undefined
}

export async function getCorpusContextItemsForEditorState(useRemote: boolean): Promise<ContextItem[]> {
    const items: ContextItem[] = []

    const rootContext = await getCodebaseContextItemsForEditorState(useRemote)
    if (rootContext) {
        items.push(rootContext)
    }

    const providers = (await openCtx.controller?.meta({}))?.filter(meta => meta.mentions?.autoInclude)
    if (!providers) {
        return items
    }

    const activeEditorContext = await getActiveEditorContextForOpenCtxMentions()

    const openctxMentions = (
        await Promise.all(
            providers.map(async (provider): Promise<ContextItemOpenCtx[]> => {
                const mentions =
                    (await openCtx?.controller?.mentions(
                        { ...activeEditorContext, autoInclude: true },
                        provider
                    )) || []

                return mentions.map(mention => ({
                    ...mention,
                    provider: 'openctx',
                    type: 'openctx',
                    uri: URI.parse(mention.uri),
                    source: ContextItemSource.Initial,
                    mention, // include the original mention to pass to `items` later
                }))
            })
        )
    ).flat()

    return [...items, ...openctxMentions]
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
