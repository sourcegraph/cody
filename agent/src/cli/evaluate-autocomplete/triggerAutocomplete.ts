import { calcPatch } from 'fast-myers-diff'
import * as vscode from 'vscode'

import { AgentTextDocument } from '../../AgentTextDocument'
import { MessageHandler } from '../../jsonrpc-alias'
import { AutocompleteResult } from '../../protocol-alias'

import { AutocompleteDocument } from './AutocompleteDocument'

export interface AutocompleteParameters {
    client: MessageHandler
    document: AutocompleteDocument

    range: vscode.Range
    modifiedContent: string
    removedContent: string
    position: vscode.Position
    emptyMatchContent: string
}

export async function triggerAutocomplete(parameters: AutocompleteParameters): Promise<void> {
    const { range, client, document, modifiedContent, removedContent, position, emptyMatchContent } = parameters

    client.notify('textDocument/didChange', { filePath: document.params.filepath, content: modifiedContent })
    let result: AutocompleteResult
    try {
        result = await client.request('autocomplete/execute', {
            filePath: document.params.filepath,
            position,
            // We don't use the "automatic" trigger to avoid certain code paths like
            // synthetic latency when acceptance rate is low.
            triggerKind: 'Invoke',
        })
    } catch (error) {
        const resultError = error instanceof Error ? error.message : String(error)
        document.pushItem({
            range,
            resultError,
        })
        return
    }

    const didNotSendNetworkRequest =
        result.items.length === 0 && result.completionEvent?.networkRequestStartedAt === null
    if (didNotSendNetworkRequest) {
        return
    }

    const textDocument = new AgentTextDocument({ filePath: document.params.filepath, content: modifiedContent })
    for (const item of result.items) {
        const original = textDocument.getText(
            new vscode.Range(
                item.range.start.line,
                item.range.start.character,
                item.range.end.line,
                item.range.end.character
            )
        )
        const completion = item.insertText
        const patches: string[] = []
        let hasNonInsertPatch = false
        for (const [sx, ex, text] of calcPatch(original, completion)) {
            if (sx !== ex) {
                hasNonInsertPatch = true
                continue
            }
            patches.push(text)
        }
        if (hasNonInsertPatch) {
            document.pushItem({
                resultText: item.insertText,
                range,
                resultNonInsertPatch: true,
                event: result.completionEvent,
            })
        } else if (patches.length > 0) {
            const text = patches.join('')
            if (text === removedContent) {
                document.pushItem({ range, resultExact: true, event: result.completionEvent })
            } else {
                document.pushItem({ range, resultText: text, event: result.completionEvent })
            }
        }
    }
    if (result.items.length === 0) {
        const expectedEmptyMatch = removedContent === emptyMatchContent
        document.pushItem({
            range,
            resultExact: expectedEmptyMatch,
            resultEmpty: !expectedEmptyMatch,
        })
    }
}
