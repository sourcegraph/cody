import { type ContextItem, type MentionQuery, parseMentionQuery } from '@sourcegraph/cody-shared'
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
        withType: (type: MentionQuery['type']) => void
    }
): Promise<ContextItem[]> {
    const mentionQuery = parseMentionQuery(query)

    // Logging: log when the at-mention starts, and then log when we know the type (after the 1st
    // character is typed). Don't log otherwise because we would be logging prefixes of the same
    // query repeatedly, which is not needed.
    if (mentionQuery.type === 'empty') {
        telemetryRecorder?.empty()
    } else if (query.length === 1) {
        telemetryRecorder?.withType(mentionQuery.type)
    }

    const MAX_RESULTS = 20
    switch (mentionQuery.type) {
        case 'empty':
            return getOpenTabsContextFile()
        case 'symbol':
            // It would be nice if the VS Code symbols API supports cancellation, but it doesn't
            return getSymbolContextFiles(mentionQuery.text, MAX_RESULTS)
        case 'file':
            return getFileContextFiles(mentionQuery.text, MAX_RESULTS, cancellationToken)
        default:
            return []
    }
}
