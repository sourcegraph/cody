import { type ContextItem, MAX_CURRENT_FILE_TOKENS, truncateText } from '@sourcegraph/cody-shared'

import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

export async function createContextFile(file: URI, content: string): Promise<ContextItem | undefined> {
    try {
        const truncatedContent = truncateText(content, MAX_CURRENT_FILE_TOKENS)
        // From line 0 to the end of truncatedContent
        const range = new vscode.Range(0, 0, truncatedContent.split('\n').length, 0)

        return {
            type: 'file',
            uri: file,
            content: truncatedContent,
            source: 'editor',
            range,
        } as ContextItem
    } catch (error) {
        console.error(error)
    }
    return undefined
}
