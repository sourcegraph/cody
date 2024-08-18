import { type ContextItem, ContextItemSource, TokenCounterUtils } from '@sourcegraph/cody-shared'

import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

export async function createContextFile(file: URI, content: string): Promise<ContextItem | undefined> {
    try {
        const range = new vscode.Range(0, 0, content.split('\n').length, 0)
        const size = await TokenCounterUtils.countTokens(content)

        return {
            type: 'file',
            uri: file,
            content,
            source: ContextItemSource.Editor,
            range,
            size,
        } satisfies ContextItem
    } catch (error) {
        console.error(error)
    }
    return undefined
}
