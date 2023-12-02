import { calcPatch } from 'fast-myers-diff'
import * as vscode from 'vscode'

import { TextDocumentWithUri } from '../../../../vscode/src/jsonrpc/TextDocumentWithUri'
import { AgentTextDocument } from '../../AgentTextDocument'
import { MessageHandler } from '../../jsonrpc-alias'
import { AutocompleteResult } from '../../protocol-alias'

import { EvaluateAutocompleteOptions } from './evaluate-autocomplete'
import { EvaluationDocument } from './EvaluationDocument'
import { testTypecheck } from './testTypecheck'

export interface AutocompleteParameters {
    client: MessageHandler
    document: EvaluationDocument

    options: EvaluateAutocompleteOptions

    range: vscode.Range
    modifiedContent: string
    removedContent: string
    position: vscode.Position
    emptyMatchContent: string
}

export async function triggerAutocomplete(parameters: AutocompleteParameters): Promise<void> {
    const { range, client, document, modifiedContent, removedContent, position, emptyMatchContent } = parameters
    client.notify('textDocument/didChange', { uri: document.uri.toString(), content: modifiedContent })
    let result: AutocompleteResult
    try {
        result = await client.request('autocomplete/execute', {
            uri: document.uri.toString(),
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

    const textDocument = new AgentTextDocument(TextDocumentWithUri.from(document.uri, { content: modifiedContent }))
    for (const item of result.items) {
        const original = textDocument.getText(
            new vscode.Range(
                item.range.start.line,
                item.range.start.character,
                item.range.end.line,
                item.range.end.character
            )
        )
        const resultTypechecks = await testTypecheck(parameters, item)
        const patches: string[] = []
        let hasNonInsertPatch = false
        for (const [sx, ex, text] of calcPatch(original, item.insertText)) {
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
                resultTypechecks,
                resultNonInsertPatch: true,
                event: result.completionEvent,
            })
        } else if (patches.length > 0) {
            const text = patches.join('')
            if (text === removedContent) {
                document.pushItem({
                    range,
                    resultExact: true,
                    event: result.completionEvent,
                    resultTypechecks,
                })
            } else {
                document.pushItem({
                    range,
                    resultText: text,
                    event: result.completionEvent,
                    resultTypechecks,
                })
            }
        } else {
            document.pushItem({
                range,
                resultEmpty: true,
                event: result.completionEvent,
            })
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
