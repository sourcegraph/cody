import {
    type ContextItem,
    FeatureFlag,
    type MentionQuery,
    type RangeData,
    featureFlagProvider,
    getURLContextItems,
    parseMentionQuery,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getContextFileFromUri } from '../../commands/context/file-path'
import {
    getFileContextFiles,
    getOpenTabsContextFile,
    getSymbolContextFiles,
} from '../../editor/utils/editor-context'

export async function getChatContextItemsForMention(
    query: MentionQuery | string,
    cancellationToken: vscode.CancellationToken,
    telemetryRecorder?: {
        empty: () => void
        withType: (type: MentionQuery['provider']) => void
    },
    range?: RangeData
): Promise<ContextItem[]> {
    const mentionQuery = typeof query === 'string' ? parseMentionQuery(query) : query

    // Logging: log when the at-mention starts, and then log when we know the type (after the 1st
    // character is typed). Don't log otherwise because we would be logging prefixes of the same
    // query repeatedly, which is not needed.
    if (mentionQuery.provider === 'default') {
        telemetryRecorder?.empty()
    } else if (mentionQuery.text.length === 1) {
        telemetryRecorder?.withType(mentionQuery.provider)
    }

    const MAX_RESULTS = 20
    switch (mentionQuery.provider) {
        case 'default':
            return getOpenTabsContextFile()
        case 'symbol':
            // It would be nice if the VS Code symbols API supports cancellation, but it doesn't
            return getSymbolContextFiles(mentionQuery.text, MAX_RESULTS)
        case 'file': {
            const files = await getFileContextFiles(mentionQuery.text, MAX_RESULTS)

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
        case 'url':
            return (await isURLContextFeatureFlagEnabled())
                ? getURLContextItems(
                      mentionQuery.text,
                      convertCancellationTokenToAbortSignal(cancellationToken)
                  )
                : []
        default:
            return []
    }
}

export async function isURLContextFeatureFlagEnabled(): Promise<boolean> {
    return (
        vscode.workspace.getConfiguration('cody').get<boolean>('experimental.urlContext') === true ||
        (await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.URLContext))
    )
}

function convertCancellationTokenToAbortSignal(token: vscode.CancellationToken): AbortSignal {
    const controller = new AbortController()
    const disposable = token.onCancellationRequested(() => {
        controller.abort()
        disposable.dispose()
    })
    return controller.signal
}
