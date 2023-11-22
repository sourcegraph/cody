import * as vscode from 'vscode'

import { ActiveTextEditorSelectionRange } from '@sourcegraph/cody-shared'
import { ContextFile, ContextMessage } from '@sourcegraph/cody-shared/src/codebase-context/messages'

import { ContextItem } from './SimpleChatModel'

// The approximate inverse of CodebaseContext.makeContextMessageWithResponse
export function contextMessageToContextItem(contextMessage: ContextMessage): ContextItem | null {
    if (!contextMessage.text) {
        return null
    }
    const contextText = stripContextWrapper(contextMessage.text)
    if (!contextText) {
        return null
    }
    if (!contextMessage.file) {
        return null
    }
    const range = contextMessage.file.range
    return {
        text: contextText,
        // TODO(beyang): Uri.file isn't correct. Maybe introduce a relative-file:// scheme?
        uri: contextMessage.file.uri || vscode.Uri.file(contextMessage.file.fileName),
        range: range && new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character),
    }
}

export function stripContextWrapper(text: string): string | undefined {
    {
        const start = text.indexOf('Use following code snippet')
        if (start >= 0) {
            text = text.slice(start)
            const lines = text.split('\n')
            return lines.slice(2, -1).join('\n')
        }
    }
    {
        const start = text.indexOf('Use the following text from file')
        if (start >= 0) {
            text = text.slice(start)
            const lines = text.split('\n')
            return lines.slice(1).join('\n')
        }
    }
    {
        const start = text.indexOf('My selected ')
        const selectedStart = text.indexOf('<selected>')
        const selectedEnd = text.indexOf('</selected>')
        if (start >= 0 && selectedStart >= 0 && selectedEnd >= 0) {
            text = text.slice(selectedStart, selectedEnd)
            const lines = text.split('\n')
            return lines.slice(1, -1).join('\n')
        }
    }
    return undefined
}

export function contextItemsToContextFiles(items: ContextItem[]): ContextFile[] {
    const contextFiles: ContextFile[] = []
    for (const item of items) {
        contextFiles.push({
            fileName: item.uri.fsPath,
            source: 'embeddings',
            range: rangeToViewRange(item.range),
            content: item.text,

            // TODO: repoName + revision?
        })
    }
    return contextFiles
}

export function rangeToViewRange(range?: vscode.Range): ActiveTextEditorSelectionRange | undefined {
    if (!range) {
        return undefined
    }
    return {
        start: {
            line: range.start.line,
            character: range.start.character,
        },
        end: {
            line: range.end.line,
            character: range.end.character,
        },
    }
}
