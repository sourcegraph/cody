import type { ContextItem, MentionQuery } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import { getFileContextFiles, getSymbolContextFiles } from '../../../editor/utils/editor-context'
import { getLabelForContextItem } from '../utils'

const MAX_FUZZY_RESULTS = 20

interface FixupMatchingContext {
    /* Unique identifier for the context, shown in the input value but not necessarily in the quick pick selector */
    key: string
    /* If present, will override the key shown in the quick pick selector */
    shortLabel?: string
    file: ContextItem
}

export async function getMatchingContext(
    mentionQuery: MentionQuery
): Promise<FixupMatchingContext[] | null> {
    if (mentionQuery.type === 'symbol') {
        const symbolResults = await getSymbolContextFiles(mentionQuery.text, MAX_FUZZY_RESULTS)
        return symbolResults.map(result => ({
            key: getLabelForContextItem(result),
            file: result,
            shortLabel: `${result.kind === 'class' ? '$(symbol-structure)' : '$(symbol-method)'} ${
                result.symbolName
            }`,
        }))
    }

    if (mentionQuery.type === 'file') {
        const cancellation = new vscode.CancellationTokenSource()
        const fileResults = await getFileContextFiles(
            mentionQuery.text,
            MAX_FUZZY_RESULTS,
            cancellation.token
        )
        return fileResults.map(result => ({
            key: getLabelForContextItem(result),
            file: result,
        }))
    }

    return null
}
