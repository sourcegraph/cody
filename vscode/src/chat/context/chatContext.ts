import type { Mention } from '@openctx/client'
import {
    CodyIDE,
    type ContextItem,
    type ContextItemOpenCtx,
    type ContextItemRepository,
    FILE_CONTEXT_MENTION_PROVIDER,
    type MentionMenuData,
    type MentionQuery,
    type OptionalProviderId,
    REMOTE_REPOSITORY_PROVIDER_URI,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    combineLatest,
    isAbortError,
    mentionProvidersMetadata,
    openCtx,
    promiseFactoryToObservable,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import { Observable, map } from 'observable-fns'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import { getContextFileFromUri } from '../../commands/context/file-path'
import { getConfiguration } from '../../configuration'
import {
    getFileContextFiles,
    getOpenTabsContextFile,
    getSymbolContextFiles,
} from '../../editor/utils/editor-context'
import {
    fetchRepoMetadataForFolder,
    workspaceReposMonitor,
} from '../../repository/repo-metadata-from-git-api'
import type { ChatModel } from '../chat-view/ChatModel'

interface GetContextItemsTelemetry {
    empty: () => void
    withProvider: (type: MentionQuery['provider'], metadata?: { id: string }) => void
}

export function getMentionMenuData(
    disabledMentionsProviders: OptionalProviderId[] | undefined | null,
    query: MentionQuery,
    chatModel: ChatModel
): Observable<MentionMenuData> {
    const source = 'chat'

    // Use numerical mapping to send source values to metadata, making this data available on all instances.
    const atMentionSourceTelemetryMetadataMapping: Record<typeof source, number> = {
        chat: 1,
    } as const

    const scopedTelemetryRecorder: GetContextItemsTelemetry = {
        empty: () => {
            telemetryRecorder.recordEvent('cody.at-mention', 'executed', {
                metadata: {
                    source: atMentionSourceTelemetryMetadataMapping[source],
                },
                privateMetadata: { source },
                billingMetadata: {
                    product: 'cody',
                    category: 'core',
                },
            })
        },
        withProvider: (provider, providerMetadata) => {
            telemetryRecorder.recordEvent(`cody.at-mention.${provider}`, 'executed', {
                metadata: { source: atMentionSourceTelemetryMetadataMapping[source] },
                privateMetadata: { source, providerMetadata },
                billingMetadata: {
                    product: 'cody',
                    category: 'core',
                },
            })
        },
    }

    const isCodyWeb = getConfiguration().agentIDE === CodyIDE.Web

    const { input, context } = chatModel.contextWindow

    try {
        const items = promiseFactoryToObservable(signal =>
            getChatContextItemsForMention(
                {
                    mentionQuery: query,
                    telemetryRecorder: scopedTelemetryRecorder,
                    rangeFilter: !isCodyWeb,
                },
                signal
            ).then(items =>
                items.map<ContextItem>(f => ({
                    ...f,
                    isTooLarge: f.size ? f.size > (context?.user || input) : undefined,
                }))
            )
        )

        const queryLower = query.text.toLowerCase()

        const providers = (
            query.provider === null
                ? mentionProvidersMetadata(disabledMentionsProviders)
                : Observable.of([])
        ).pipe(map(providers => providers.filter(p => p.title.toLowerCase().includes(queryLower))))

        return combineLatest([providers, items]).map(([providers, items]) => ({
            providers,
            items,
        }))
    } catch (error) {
        if (isAbortError(error)) {
            throw error // rethrow as-is so it gets ignored by our caller
        }
        throw new Error(`Error retrieving mentions: ${error}`)
    }
}

interface GetContextItemsOptions {
    mentionQuery: MentionQuery

    // Logging: log when the at-mention starts, and then log when we know the type (after the 1st
    // character is typed). Don't log otherwise because we would be logging prefixes of the same
    // query repeatedly, which is not needed.
    telemetryRecorder?: GetContextItemsTelemetry
    rangeFilter?: boolean
}

export async function getChatContextItemsForMention(
    options: GetContextItemsOptions,
    _?: AbortSignal
): Promise<ContextItem[]> {
    const MAX_RESULTS = 20
    const { mentionQuery, telemetryRecorder, rangeFilter = true } = options

    switch (mentionQuery.provider) {
        case null:
            telemetryRecorder?.empty()
            return getOpenTabsContextFile()
        case SYMBOL_CONTEXT_MENTION_PROVIDER.id:
            telemetryRecorder?.withProvider(mentionQuery.provider)
            // It would be nice if the VS Code symbols API supports cancellation, but it doesn't
            return getSymbolContextFiles(
                mentionQuery.text,
                MAX_RESULTS,
                mentionQuery.contextRemoteRepositoriesNames
            )
        case FILE_CONTEXT_MENTION_PROVIDER.id: {
            telemetryRecorder?.withProvider(mentionQuery.provider)
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
            telemetryRecorder?.withProvider('openctx', { id: mentionQuery.provider })

            if (!openCtx.controller) {
                return []
            }

            const items = await openCtx.controller.mentions(
                { query: mentionQuery.text, ...(await getActiveEditorContextForOpenCtxMentions()) },
                // get mention items for the selected provider only.
                { providerUri: mentionQuery.provider }
            )

            return items.map((item): ContextItemOpenCtx | ContextItemRepository =>
                contextItemMentionFromOpenCtxItem(item)
            )
        }
    }
}

export async function getActiveEditorContextForOpenCtxMentions(): Promise<{
    uri: string | undefined
    codebase: string | undefined
}> {
    const uri = vscode.window.activeTextEditor?.document.uri?.toString()
    const activeWorkspaceURI =
        uri &&
        workspaceReposMonitor?.getFolderURIs().find(folderURI => uri?.startsWith(folderURI.toString()))

    const codebase =
        activeWorkspaceURI && (await fetchRepoMetadataForFolder(activeWorkspaceURI))[0]?.repoName

    return { uri, codebase }
}

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
