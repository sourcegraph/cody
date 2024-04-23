import type { ContextItem, MentionQuery, MentionTrigger } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import { getChatContextItemsForMention } from '../../chat/context/chatContext'
import { getLabelForContextItem } from './utils'

interface FixupMatchingContext {
    /* Unique identifier for the context, shown in the input value but not necessarily in the quick pick selector */
    key: string
    /* If present, will override the key shown in the quick pick selector */
    shortLabel?: string
    item: ContextItem
}

export async function getMatchingContext(
    trigger: MentionTrigger,
    mentionQuery: MentionQuery
): Promise<FixupMatchingContext[]> {
    const token = new vscode.CancellationTokenSource()?.token
    const results = await getChatContextItemsForMention(trigger, mentionQuery, token)

    return results.map(result => {
        return {
            key: getLabelForContextItem(result),
            item: result,
            shortLabel:
                result.type === 'symbol'
                    ? `${result.kind === 'class' ? '$(symbol-structure)' : '$(symbol-method)'} ${
                          result.symbolName
                      }`
                    : undefined,
        }
    })
}
