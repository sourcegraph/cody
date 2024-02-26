import { calcPatch } from 'fast-myers-diff'
import * as vscode from 'vscode'
import type { Tree, default as Parser } from 'web-tree-sitter'

import { ProtocolTextDocumentWithUri } from '../../../../vscode/src/jsonrpc/TextDocumentWithUri'
import { AgentTextDocument } from '../../AgentTextDocument'
import type { MessageHandler } from '../../jsonrpc-alias'
import type { AutocompleteResult } from '../../protocol-alias'

import type { AutocompleteMatchKind } from './AutocompleteMatcher'
import type { EvaluationDocument } from './EvaluationDocument'
import type { TestParameters } from './TestParameters'
import type { EvaluateAutocompleteOptions } from './evaluate-autocomplete'
import { testParses } from './testParse'
import { testTypecheck } from './testTypecheck'

export interface AutocompleteParameters {
    parser?: Parser
    originalTree?: Tree
    originalTreeIsErrorFree?: boolean
    client: MessageHandler
    document: EvaluationDocument

    options: EvaluateAutocompleteOptions

    range: vscode.Range
    autocompleteKind?: AutocompleteMatchKind
    modifiedContent: string
    removedContent: string
    position: vscode.Position
}

export async function triggerAutocomplete(parameters: AutocompleteParameters): Promise<void> {
    const { range, client, document, modifiedContent, autocompleteKind, removedContent, position } =
        parameters
    client.notify('textDocument/didChange', {
        uri: document.uri.toString(),
        filePath: document.uri.fsPath,
        content: modifiedContent,
    })
    let result: AutocompleteResult
    try {
        result = await client.request('autocomplete/execute', {
            uri: document.uri.toString(),
            filePath: document.uri.fsPath,
            position,
            // We don't use the "automatic" trigger to avoid certain code paths like
            // synthetic latency when acceptance rate is low.
            triggerKind: 'Invoke',
        })
    } catch (error) {
        const resultError = error instanceof Error ? error.message : String(error)
        document.pushItem({
            autocompleteKind,
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

    const textDocument = new AgentTextDocument(
        ProtocolTextDocumentWithUri.from(document.uri, { content: modifiedContent })
    )
    for (const [index, item] of result.items.entries()) {
        const info = result.completionEvent?.items?.[index]
        const original = textDocument.getText(
            new vscode.Range(
                item.range.start.line,
                item.range.start.character,
                item.range.end.line,
                item.range.end.character
            )
        )
        const start = new vscode.Position(item.range.start.line, item.range.start.character)
        const end = new vscode.Position(item.range.end.line, item.range.end.character)
        const modifiedDocument = new AgentTextDocument(
            ProtocolTextDocumentWithUri.from(document.uri, { content: parameters.modifiedContent })
        )
        const newText = [
            modifiedDocument.getText(new vscode.Range(new vscode.Position(0, 0), start)),
            item.insertText,
            modifiedDocument.getText(
                new vscode.Range(end, new vscode.Position(modifiedDocument.lineCount, 0))
            ),
        ].join('')
        const testParameters: TestParameters = { ...parameters, item, newText }
        let resultParses: boolean | undefined
        if (parameters.originalTreeIsErrorFree && parameters.parser && parameters.options.testParse) {
            resultParses = testParses(newText, parameters.parser)
        }

        const resultTypechecks = await testTypecheck(testParameters)
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
                autocompleteKind,
                range,
                resultTypechecks,
                resultParses,
                resultNonInsertPatch: true,
                event: result.completionEvent,
                info,
            })
        } else if (patches.length > 0) {
            const text = patches.join('')
            if (text === removedContent) {
                document.pushItem({
                    autocompleteKind,
                    info,
                    range,
                    resultExact: true,
                    resultParses,
                    event: result.completionEvent,
                    resultTypechecks,
                })
            } else {
                document.pushItem({
                    autocompleteKind,
                    info,
                    range,
                    resultText: text,
                    resultParses,
                    event: result.completionEvent,
                    resultTypechecks,
                })
            }
        } else {
            document.pushItem({
                autocompleteKind,
                info,
                range,
                resultEmpty: true,
                event: result.completionEvent,
                resultParses,
            })
        }
    }
    if (result.items.length === 0) {
        const expectedEmptyMatch = removedContent === ''
        document.pushItem({
            autocompleteKind,
            range,
            resultExact: expectedEmptyMatch,
            resultEmpty: !expectedEmptyMatch,
        })
    }
}
