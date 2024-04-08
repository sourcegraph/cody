import {
    type ContextItem,
    ContextItemSource,
    USER_CONTEXT_TOKEN_BUDGET_IN_BYTES,
    truncateText,
} from '@sourcegraph/cody-shared'

import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

export async function createContextFile(file: URI, content: string): Promise<ContextItem | undefined> {
    try {
        const truncatedContent = truncateText(content, USER_CONTEXT_TOKEN_BUDGET_IN_BYTES)
        // From line 0 to the end of truncatedContent
        const range = new vscode.Range(0, 0, truncatedContent.split('\n').length, 0)

        return {
            type: 'file',
            uri: file,
            content: truncatedContent,
            source: ContextItemSource.Editor,
            range,
            isTooLarge: content.length > USER_CONTEXT_TOKEN_BUDGET_IN_BYTES,
        } satisfies ContextItem
    } catch (error) {
        console.error(error)
    }
    return undefined
}
