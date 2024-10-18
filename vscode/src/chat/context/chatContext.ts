import type { Mention } from '@openctx/client'
import {
    type ContextItem,
    type ContextItemOpenCtx,
    type ContextItemRepository,
    type ContextMentionProviderID,
    FILE_CONTEXT_MENTION_PROVIDER,
    type MentionMenuData,
    type MentionQuery,
    REMOTE_REPOSITORY_PROVIDER_URI,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    clientCapabilities,
    combineLatest,
    firstResultFromOperation,
    fromVSCodeEvent,
    isAbortError,
    isError,
    mentionProvidersMetadata,
    openCtx,
    pendingOperation,
    promiseFactoryToObservable,
    skipPendingOperation,
    startWith,
    switchMapReplayOperation,
    telemetryEvents,
} from '@sourcegraph/cody-shared'
import { LRUCache } from 'lru-cache'
import { Observable, map } from 'observable-fns'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import { getContextFileFromUri } from '../../commands/context/file-path'
import {
    getFileContextFiles,
    getOpenTabsContextFile,
    getSymbolContextFiles,
} from '../../editor/utils/editor-context'
import { repoNameResolver } from '../../repository/repo-name-resolver'
import { ChatBuilder } from '../chat-view/ChatBuilder'

/**
 * This state is used to keep track of telemetry events that have already fired
 */
const mentionMenuTelemetryCache = new LRUCache<string | number, Set<string | null>>({ max: 10 })

export function getMentionMenuData(options: {
    disableProviders: ContextMentionProviderID[]
    query: MentionQuery
    chatBuilder: ChatBuilder
}): Observable<MentionMenuData> {
    try {
        const items = combineLatest(
            promiseFactoryToObservable(signal =>
                getChatContextItemsForMention(
                    {
                        mentionQuery: options.query,
                        rangeFilter: !clientCapabilities().isCodyWeb,
                    },
                    signal
                )
            ),
            ChatBuilder.contextWindowForChat(options.chatBuilder)
        ).pipe(
            map(([items, contextWindow]) =>
                contextWindow === pendingOperation
                    ? pendingOperation
                    : items.map<ContextItem>(f => ({
                          ...f,
                          isTooLarge:
                              f.size && !isError(contextWindow)
                                  ? f.size > (contextWindow.context?.user || contextWindow.input)
                                  : undefined,
                      }))
            ),
            skipPendingOperation()
        )

        const queryLower = options.query.text.toLowerCase()

        const providers = (
            options.query.provider === null
                ? mentionProvidersMetadata({ disableProviders: options.disableProviders })
                : Observable.of([])
        ).pipe(map(providers => providers.filter(p => p.title.toLowerCase().includes(queryLower))))

        const results = combineLatest(providers, items).map(([providers, items]) => ({
            providers,
            items,
        }))

        //telemetry
        if (options.query.interactionID !== null && options.query.interactionID !== undefined) {
            const cache =
                mentionMenuTelemetryCache.get(options.query.interactionID) ?? new Set<string | null>()
            if (!cache.has(options.query.provider)) {
                cache.add(options.query.provider)
                telemetryEvents['cody.at-mention/selected'].record('chat', options.query.provider)
            }
            mentionMenuTelemetryCache.set(options.query.interactionID, cache)
        }

        return results
    } catch (error) {
        if (isAbortError(error)) {
            throw error // rethrow as-is so it gets ignored by our caller
        }
        throw new Error(`Error retrieving mentions: ${error}`)
    }
}

interface GetContextItemsOptions {
    mentionQuery: MentionQuery
    rangeFilter?: boolean
}

export async function getChatContextItemsForMention(
    options: GetContextItemsOptions,
    _?: AbortSignal
): Promise<ContextItem[]> {
    const MAX_RESULTS = 20
    const { mentionQuery, rangeFilter = true } = options

    switch (mentionQuery.provider) {
        case null:
            return getOpenTabsContextFile()
        case SYMBOL_CONTEXT_MENTION_PROVIDER.id:
            // It would be nice if the VS Code symbols API supports cancellation, but it doesn't
            return getSymbolContextFiles(
                mentionQuery.text,
                MAX_RESULTS,
                mentionQuery.contextRemoteRepositoriesNames
            )
        case FILE_CONTEXT_MENTION_PROVIDER.id: {
            const files = mentionQuery.text
                ? await getFileContextFiles({
                      query: mentionQuery.text,
                      range: mentionQuery.range,
                      maxResults: MAX_RESULTS,
                      repositoriesNames: mentionQuery.contextRemoteRepositoriesNames,
                  })
                : await getOpenTabsContextFile()

            // If a range is provided, that means user is trying to mention a specific line range.
            // We will get the content of the file for that range to display file size warning if needed.
            if (mentionQuery.range && files.length > 0 && rangeFilter) {
                const item = await getContextFileFromUri(
                    files[0].uri,
                    new vscode.Range(mentionQuery.range.start.line, 0, mentionQuery.range.end.line, 0)
                )
                return item ? [item] : []
            }

            return files
        }

        default: {
            if (!openCtx.controller) {
                return []
            }

            const items = await openCtx.controller.mentions(
                {
                    query: mentionQuery.text,
                    ...(await firstResultFromOperation(activeEditorContextForOpenCtxMentions)),
                },
                // get mention items for the selected provider only.
                { providerUri: mentionQuery.provider }
            )

            return items.map((item): ContextItemOpenCtx | ContextItemRepository =>
                contextItemMentionFromOpenCtxItem(item)
            )
        }
    }
}

const activeTextEditor: Observable<vscode.TextEditor | undefined> = fromVSCodeEvent(
    vscode.window.onDidChangeActiveTextEditor
).pipe(
    startWith(undefined),
    map(() => vscode.window.activeTextEditor)
)

interface ContextForOpenCtxMentions {
    uri: string | undefined
    codebase: string | undefined
}
export const activeEditorContextForOpenCtxMentions: Observable<
    ContextForOpenCtxMentions | typeof pendingOperation | Error
> = activeTextEditor.pipe(
    switchMapReplayOperation(
        (textEditor): Observable<ContextForOpenCtxMentions | typeof pendingOperation> => {
            const uri = textEditor?.document.uri
            if (!uri) {
                return Observable.of({ uri: undefined, codebase: undefined })
            }

            return repoNameResolver.getRepoNamesContainingUri(uri).pipe(
                map(repoNames =>
                    repoNames === pendingOperation
                        ? pendingOperation
                        : {
                              uri: uri.toString(),
                              codebase: repoNames.at(0),
                          }
                ),
                map(value => {
                    if (isError(value)) {
                        return { uri: uri.toString(), codebase: undefined }
                    }
                    return value
                })
            )
        }
    )
)

export function contextItemMentionFromOpenCtxItem(
    item: Mention & { providerUri: string }
): ContextItemOpenCtx | ContextItemRepository {
    // HACK: The OpenCtx protocol does not support returning isIgnored
    // and it does not make sense to expect providers to return disabled
    // items. That is why we are using `item.data?.ignored`. We only need
    // this for our internal Sourcegraph Repositories provider.
    const isIgnored = item.data?.isIgnored as boolean | undefined

    return item.providerUri === REMOTE_REPOSITORY_PROVIDER_URI
        ? ({
              type: 'repository',
              uri: URI.parse(item.uri),
              isIgnored,
              title: item.title,
              repoName: item.title,
              repoID: item.data!.repoId as string,
              provider: 'openctx',
              content: null,
          } satisfies ContextItemRepository)
        : ({
              type: 'openctx',
              uri: URI.parse(item.uri),
              isIgnored,
              title: item.title,
              providerUri: item.providerUri,
              provider: 'openctx',
              mention: {
                  uri: item.uri,
                  data: item.data,
                  description: item.description,
              },
          } satisfies ContextItemOpenCtx)
}
