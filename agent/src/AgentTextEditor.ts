import { logDebug } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { MessageHandler } from '../../vscode/src/jsonrpc/jsonrpc'
import type { AgentTextDocument } from './AgentTextDocument'
import type { EditFunction } from './AgentWorkspaceDocuments'

export class AgentTextEditor implements vscode.TextEditor {
    constructor(
        private readonly agentDocument: AgentTextDocument,
        private readonly params?: {
            agent?: MessageHandler
            edit?: EditFunction
        }
    ) {}
    get document(): AgentTextDocument {
        return this.agentDocument
    }
    get selection(): vscode.Selection {
        const protocolSelection = this.agentDocument.protocolDocument.selection
        const selection: vscode.Selection = protocolSelection
            ? new vscode.Selection(
                  new vscode.Position(protocolSelection.start.line, protocolSelection.start.character),
                  new vscode.Position(protocolSelection.end.line, protocolSelection.end.character)
              )
            : // Default to putting the cursor at the start of the file.
              new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))
        return selection
    }

    // Notice: VSC `selection` method is synchronous,
    // but we need to asynchronously call agent and cannot wait for operation to finish.
    // This may lead to potential issues if the following code bases on the `selection` result.
    set selection(newSelection: vscode.Selection) {
        this.params?.agent?.request('textEditor/selection', {
            uri: this.agentDocument.protocolDocument.uri.toString(),
            selection: {
                start: {
                    line: newSelection.start.line,
                    character: newSelection.start.character,
                },
                end: {
                    line: newSelection.end.line,
                    character: newSelection.end.character,
                },
            },
        })
    }

    get selections(): readonly vscode.Selection[] {
        return [this.selection]
    }
    get visibleRanges(): readonly vscode.Range[] {
        const protocolVisibleRange = this.agentDocument.protocolDocument.visibleRange
        const visibleRange = protocolVisibleRange
            ? new vscode.Selection(
                  new vscode.Position(
                      protocolVisibleRange.start.line,
                      protocolVisibleRange.start.character
                  ),
                  new vscode.Position(protocolVisibleRange.end.line, protocolVisibleRange.end.character)
              )
            : this.selection
        return [visibleRange]
    }
    get options(): vscode.TextEditorOptions {
        return {
            cursorStyle: undefined,
            insertSpaces: undefined,
            lineNumbers: undefined,
            // TODO: fix tabSize
            tabSize: 2,
        }
    }
    viewColumn = vscode.ViewColumn.Active

    // IMPORTANT(olafurpg): `edit` must be defined as a fat arrow. The tests
    // fail if it's defined as a normal class method.
    edit = (
        callback: (editBuilder: vscode.TextEditorEdit) => void,
        options?: { readonly undoStopBefore: boolean; readonly undoStopAfter: boolean } | undefined
    ): Promise<boolean> => {
        if (this.params?.edit) {
            return this.params.edit(this.agentDocument.uri, callback, options)
        }
        logDebug('AgentTextEditor:edit()', 'not supported')
        return Promise.resolve(false)
    }
    insertSnippet(
        snippet: vscode.SnippetString,
        location?:
            | vscode.Range
            | vscode.Position
            | readonly vscode.Range[]
            | readonly vscode.Position[]
            | undefined,
        options?: { readonly undoStopBefore: boolean; readonly undoStopAfter: boolean } | undefined
    ): Thenable<boolean> {
        // Do nothing, for now.
        return Promise.resolve(true)
    }
    setDecorations(
        decorationType: vscode.TextEditorDecorationType,
        rangesOrOptions: readonly vscode.Range[] | readonly vscode.DecorationOptions[]
    ): void {
        // Do nothing, for now
    }

    // Notice: VSC `revealRange` method is synchronous,
    // but we need to asynchronously call agent and cannot wait for operation to finish.
    // This may lead to potential issues if the following code bases on the `revealRange` result.
    revealRange(range: vscode.Range, revealType?: vscode.TextEditorRevealType | undefined): void {
        this.params?.agent?.request('textEditor/revealRange', {
            uri: this.agentDocument.protocolDocument.uri.toString(),
            range: {
                start: {
                    line: range.start.line,
                    character: range.start.character,
                },
                end: {
                    line: range.end.line,
                    character: range.end.character,
                },
            },
        })
    }
    show(column?: vscode.ViewColumn | undefined): void {
        // Do nothing, for now.
    }
    hide(): void {
        // Do nothing, for now.
    }
}
