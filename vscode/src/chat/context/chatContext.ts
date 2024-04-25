import {
    CONTEXT_MENTION_PROVIDERS,
    type ContextItem,
    type ContextMentionProvider,
    type ContextMentionProviderInformation,
    type MentionQuery,
    type RangeData,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getContextFileFromUri } from '../../commands/context/file-path'
import {
    getFileContextFiles,
    getOpenTabsContextFile,
    getSymbolContextFiles,
} from '../../editor/utils/editor-context'

export async function getChatContextItemsForMention(
    query: MentionQuery,
    cancellationToken: vscode.CancellationToken,
    telemetryRecorder?: {
        empty: () => void
        withProvider: (type: MentionQuery['provider']) => void
    },
    range?: RangeData
): Promise<ContextItem[]> {
    // Logging: log when the at-mention starts, and then log when we know the type (after the 1st
    // character is typed). Don't log otherwise because we would be logging prefixes of the same
    // query repeatedly, which is not needed.
    if (query.provider === 'default') {
        telemetryRecorder?.empty()
    } else {
        telemetryRecorder?.withProvider(query.provider)
    }

    const MAX_RESULTS = 20
    switch (query.provider) {
        case 'default':
            return getOpenTabsContextFile()
        case 'symbol':
            // It would be nice if the VS Code symbols API supports cancellation, but it doesn't
            return getSymbolContextFiles(query.text, MAX_RESULTS)
        case 'file': {
            const files = await getFileContextFiles(query.text, MAX_RESULTS)

            // If a range is provided, that means user is trying to mention a specific line range.
            // We will get the content of the file for that range to display file size warning if needed.
            if (range && files.length) {
                return getContextFileFromUri(
                    files[0].uri,
                    new vscode.Range(range.start.line, 0, range.end.line, 0)
                )
            }

            return files
        }

        default: {
            for (const provider of getEnabledContextMentionProviders()) {
                if (provider.id === query.provider) {
                    return provider.queryContextItems(
                        query.text,
                        convertCancellationTokenToAbortSignal(cancellationToken)
                    )
                }
            }
            return []
        }
    }
}

export function getMentionProvidersForMention(
    mentionQuery: MentionQuery,
    providers: ContextMentionProvider[]
): ContextMentionProviderInformation[] {
    //if the mention query is already matched to a provider nothing else can possibly match
    if (
        !(
            mentionQuery.provider === 'default' ||
            mentionQuery.provider === 'file' ||
            mentionQuery.provider === 'symbol'
        )
    ) {
        return []
    }

    const providerInformation: ContextMentionProviderInformation[] = []
    for (const provider of providers) {
        const { id, icon, description, triggerPrefixes } = provider
        if (!icon || !description) {
            continue
        }
        providerInformation.push({ id, icon, description, triggerPrefixes })
    }
    return providerInformation
}

export function getEnabledContextMentionProviders(): ContextMentionProvider[] {
    const isAllEnabled =
        vscode.workspace.getConfiguration('cody').get<boolean>('experimental.noodle') === true
    if (isAllEnabled) {
        return CONTEXT_MENTION_PROVIDERS
    }

    const isURLProviderEnabled =
        vscode.workspace.getConfiguration('cody').get<boolean>('experimental.urlContext') === true
    if (isURLProviderEnabled) {
        return CONTEXT_MENTION_PROVIDERS.filter(provider => provider.id === 'url')
    }

    //TODO(rnauta): const isMentionProviderEnabled
    return []
}

function convertCancellationTokenToAbortSignal(token: vscode.CancellationToken): AbortSignal {
    const controller = new AbortController()
    const disposable = token.onCancellationRequested(() => {
        controller.abort()
        disposable.dispose()
    })
    return controller.signal
}
