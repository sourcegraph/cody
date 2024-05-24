import { logDebug } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { AgentTextDocument } from './AgentTextDocument'
import type { EditFunction } from './AgentWorkspaceDocuments'

export class AgentTextEditor implements vscode.TextEditor {
    constructor(
        private readonly agentDocument: AgentTextDocument,
        private readonly params?: { edit?: EditFunction }
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
    revealRange(range: vscode.Range, revealType?: vscode.TextEditorRevealType | undefined): void {
        // Do nothing, for now.
    }
    show(column?: vscode.ViewColumn | undefined): void {
        // Do nothing, for now.
    }
    hide(): void {
        // Do nothing, for now.
    }
}
