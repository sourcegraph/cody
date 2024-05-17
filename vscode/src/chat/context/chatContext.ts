import {
    CONTEXT_MENTION_PROVIDERS,
    type ContextItem,
    type ContextItemOpenCtx,
    type ContextMentionProvider,
    FILE_CONTEXT_MENTION_PROVIDER,
    type MentionQuery,
    PACKAGE_CONTEXT_MENTION_PROVIDER,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    URL_CONTEXT_MENTION_PROVIDER,
    getOpenCtxClient,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import { getContextFileFromUri } from '../../commands/context/file-path'
import {
    getFileContextFiles,
    getOpenTabsContextFile,
    getSymbolContextFiles,
} from '../../editor/utils/editor-context'

export async function getChatContextItemsForMention(
    mentionQuery: MentionQuery,
    cancellationToken: vscode.CancellationToken,
    telemetryRecorder?: {
        empty: () => void
        withProvider: (type: MentionQuery['provider']) => void
    }
): Promise<ContextItem[]> {
    // Logging: log when the at-mention starts, and then log when we know the type (after the 1st
    // character is typed). Don't log otherwise because we would be logging prefixes of the same
    // query repeatedly, which is not needed.
    if (mentionQuery.provider === null) {
        telemetryRecorder?.empty()
    } else {
        telemetryRecorder?.withProvider(mentionQuery.provider)
    }

    const MAX_RESULTS = 20
    switch (mentionQuery.provider) {
        case null:
            return getOpenTabsContextFile()
        case SYMBOL_CONTEXT_MENTION_PROVIDER.id:
            // It would be nice if the VS Code symbols API supports cancellation, but it doesn't
            return getSymbolContextFiles(mentionQuery.text, MAX_RESULTS)
        case FILE_CONTEXT_MENTION_PROVIDER.id: {
            const files = mentionQuery.text
                ? await getFileContextFiles(mentionQuery.text, MAX_RESULTS)
                : await getOpenTabsContextFile()

            // If a range is provided, that means user is trying to mention a specific line range.
            // We will get the content of the file for that range to display file size warning if needed.
            if (mentionQuery.range && files.length > 0) {
                return getContextFileFromUri(
                    files[0].uri,
                    new vscode.Range(mentionQuery.range.start.line, 0, mentionQuery.range.end.line, 0)
                )
            }

            return files
        }

        default: {
            const openctxClient = getOpenCtxClient()
            if (!openctxClient) {
                return []
            }

            const items = await openctxClient.mentions(
                { query: mentionQuery.text },
                mentionQuery.provider
            )

            return items.map(
                (item): ContextItemOpenCtx => ({
                    type: 'openctx',
                    title: item.title,
                    uri: URI.parse(item.uri),
                    providerUri: item.providerUri,
                })
            )
        }
    }
}

export function getEnabledContextMentionProviders(): ContextMentionProvider[] {
    const isAllEnabled =
        vscode.workspace.getConfiguration('cody').get<boolean>('experimental.noodle') === true
    if (isAllEnabled) {
        return CONTEXT_MENTION_PROVIDERS
    }

    const isURLProviderEnabled =
        vscode.workspace.getConfiguration('cody').get<boolean>('experimental.urlContext') === true
    const isPackageProviderEnabled =
        vscode.workspace.getConfiguration('cody').get<boolean>('experimental.packageContext') === true

    if (isURLProviderEnabled || isPackageProviderEnabled) {
        return CONTEXT_MENTION_PROVIDERS.filter(
            provider =>
                (isURLProviderEnabled && provider.id === URL_CONTEXT_MENTION_PROVIDER.id) ||
                (isPackageProviderEnabled && provider.id === PACKAGE_CONTEXT_MENTION_PROVIDER.id)
        )
    }
    return []
}
