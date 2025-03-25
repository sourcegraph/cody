import type { Mention } from '@openctx/client'
import {
    type ContextItem,
    type ContextItemOpenCtx,
    type ContextItemRepository,
    type ContextMentionProviderID,
    FILE_CONTEXT_MENTION_PROVIDER,
    GLOBAL_SEARCH_PROVIDER_URI,
    type MentionMenuData,
    type MentionQuery,
    REMOTE_REPOSITORY_PROVIDER_URI,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    clientCapabilities,
    combineLatest,
    currentOpenCtxController,
    firstResultFromOperation,
    fromVSCodeEvent,
    isAbortError,
    isError,
    mentionProvidersMetadata,
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
    experimentalPromptEditor?: boolean
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

        const providers =
            options.query.provider === null || options.query.provider === GLOBAL_SEARCH_PROVIDER_URI
                ? mentionProvidersMetadata({
                      disableProviders: options.disableProviders,
                      query: options.query.text,
                      experimentalPromptEditor: options.experimentalPromptEditor,
                  })
                : Observable.of([])

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
    const MAX_RESULTS = 10
    const { mentionQuery, rangeFilter = true } = options

    switch (mentionQuery.provider) {
        case null:
            return []
        case GLOBAL_SEARCH_PROVIDER_URI:
            return getGlobalSearchContextItems(mentionQuery, rangeFilter, MAX_RESULTS)
        case SYMBOL_CONTEXT_MENTION_PROVIDER.id:
            // It would be nice if the VS Code symbols API supports cancellation, but it doesn't
            return getSymbolContextFiles(
                mentionQuery.text,
                MAX_RESULTS,
                mentionQuery.contextRemoteRepositoriesNames
            )
        case FILE_CONTEXT_MENTION_PROVIDER.id: {
            return getFileContextItems(mentionQuery, rangeFilter, MAX_RESULTS)
        }

        default: {
            const items = await currentOpenCtxController().mentions(
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

const getFileContextItems = async (
    mentionQuery: MentionQuery,
    rangeFilter: boolean,
    maxResults: number
) => {
    const files = mentionQuery.text
        ? await getFileContextFiles({
              query: mentionQuery.text,
              range: mentionQuery.range,
              maxResults,
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

const getRepositoryContextItems = async (mentionQuery: MentionQuery, maxResults: number) => {
    return currentOpenCtxController()
        .mentions(
            {
                query: mentionQuery.text,
            },
            {
                providerUri: REMOTE_REPOSITORY_PROVIDER_URI,
            }
        )
        .then(items => items.map(contextItemMentionFromOpenCtxItem))
        .then(items =>
            items
                .sort(
                    (a, b) =>
                        getSearchMatchRank(a, mentionQuery.text) -
                        getSearchMatchRank(b, mentionQuery.text)
                )
                .slice(0, maxResults)
        )
}

export enum BestMatch {
    Exact = 0,
    StartsWith = 1,
    Contains = 2,
    NoMatch = 3,
}

// TypeMatchOrder defines the priority order for different types of matches (Exact, StartsWith, Contains, NoMatch)
// For each match type, it specifies the ranking (0 being highest) for repositories, files and symbols
// For exact matches and startsWith, repositories are prioritized highest
// For contains and no match cases, files are prioritized highest
// Symbols consistently have lowest priority (2) across all match types
const TypeMatchOrder: Record<BestMatch, Record<'file' | 'symbol' | 'repository', number>> = {
    [BestMatch.Exact]: { repository: 0, file: 1, symbol: 2 },
    [BestMatch.StartsWith]: { repository: 0, file: 1, symbol: 2 },
    [BestMatch.Contains]: { file: 0, repository: 1, symbol: 2 },
    [BestMatch.NoMatch]: { file: 0, repository: 1, symbol: 2 },
}

export const getSearchMatchRank = (item: ContextItem, query: string): BestMatch => {
    const searchableValues: string[] = []
    const normalizedQuery = query.toLowerCase().trim()

    // Get all searchable values based on item type
    if (item.title) {
        searchableValues.push(item.title.toLowerCase())
    }

    // Add type-specific searchable values
    switch (item.type) {
        case 'file': {
            searchableValues.push(item.uri.path.toLowerCase())
            const basename = item.uri.path.split('/').pop()
            if (basename) {
                searchableValues.push(basename.toLowerCase())
            }
            break
        }
        case 'repository': {
            searchableValues.push(item.repoName.toLowerCase())
            const repoName = item.repoName.split('/').pop()
            if (repoName) {
                searchableValues.push(repoName.toLowerCase())
            }
            break
        }
        case 'symbol': {
            searchableValues.push(item.symbolName.toLowerCase())
            break
        }
    }

    // Find the best match among all searchable values
    let bestMatch = BestMatch.NoMatch
    for (const value of searchableValues) {
        if (value === normalizedQuery) {
            return BestMatch.Exact // Exact match is best possible
        }
        if (value.startsWith(normalizedQuery)) {
            bestMatch = Math.min(bestMatch, BestMatch.StartsWith)
        }
        if (value.includes(normalizedQuery)) {
            bestMatch = Math.min(bestMatch, BestMatch.Contains)
        }
    }

    return bestMatch
}
const sortByBestMatch = (a: ContextItem, b: ContextItem, mentionQuery: MentionQuery) => {
    const matchA = getSearchMatchRank(a, mentionQuery.text)
    const matchB = getSearchMatchRank(b, mentionQuery.text)
    if (matchA !== matchB) {
        return matchA - matchB
    }

    const typeOrder = TypeMatchOrder[matchA]
    const typeA = typeOrder[a.type as keyof typeof typeOrder] ?? BestMatch.NoMatch
    const typeB = typeOrder[b.type as keyof typeof typeOrder] ?? BestMatch.NoMatch

    return typeA - typeB
}

const getGlobalSearchContextItems = async (
    mentionQuery: MentionQuery,
    rangeFilter: boolean,
    maxResults: number // default 10
) => {
    const [fileContextItems, symbolContextItems, repositoryContextItems] = await Promise.all([
        getFileContextItems(mentionQuery, rangeFilter, maxResults),
        getSymbolContextFiles(
            mentionQuery.text,
            // at max 4 symbol results
            Math.max(maxResults / 4, 3),
            mentionQuery.contextRemoteRepositoriesNames
        ),
        getRepositoryContextItems(
            mentionQuery,
            // at max 4 repository results
            Math.min(maxResults / 4, 3)
        ),
    ])

    return [
        ...[
            ...fileContextItems
                .sort((a, b) => sortByBestMatch(a, b, mentionQuery))
                .slice(0, maxResults - symbolContextItems.length - repositoryContextItems.length),
            ...repositoryContextItems,
        ].sort((a, b) => sortByBestMatch(a, b, mentionQuery)),
        // always keep symbol results at the last, sorted by best match
        ...symbolContextItems.sort((a, b) => sortByBestMatch(a, b, mentionQuery)),
    ]
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
                        ? { uri: uri.toString(), codebase: undefined }
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
