import type { ContextItem } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import {
    getFileContextFiles,
    getOpenTabsContextFile,
    getSymbolContextFiles,
} from '../../editor/utils/editor-context'

export async function getChatContextItemsForMention(
    query: string,
    cancellationToken: vscode.CancellationToken,
    telemetryRecorder?: {
        empty: () => void
        withType: (type: 'symbol' | 'file') => void
    }
): Promise<ContextItem[]> {
    // Logging: log when the at-mention starts, and then log when we know the type (after the 1st
    // character is typed). Don't log otherwise because we would be logging prefixes of the same
    // query repeatedly, which is not needed.
    const queryType = query.startsWith('#') ? 'symbol' : 'file'
    if (query === '') {
        telemetryRecorder?.empty()
    } else if (query.length === 1) {
        telemetryRecorder?.withType(queryType)
    }

    if (query.length === 0) {
        return getOpenTabsContextFile()
    }

    const MAX_RESULTS = 20
    if (query.startsWith('#')) {
        // It would be nice if the VS Code symbols API supports cancellation, but it doesn't
        return getSymbolContextFiles(query.slice(1), MAX_RESULTS)
    }
    return getFileContextFiles(query, MAX_RESULTS, cancellationToken)
}
