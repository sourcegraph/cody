import { logDebug } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { AgentTextDocument } from './AgentTextDocument'
import type { EditFunction } from './AgentWorkspaceDocuments'

export class AgentTextEditor implements vscode.TextEditor {
    constructor(
        public readonly document: AgentTextDocument,
        private readonly params?: { edit?: EditFunction }
    ) {}
    get selection(): vscode.Selection {
        const cmSelection = this.document.state.selection
        return new vscode.Selection(
            this.document.positionAt(cmSelection.main.from),
            this.document.positionAt(cmSelection.main.to)
        )
    }
    get selections(): readonly vscode.Selection[] {
        const cmSelection = this.document.state.selection
        return cmSelection.ranges.map(
            range =>
                new vscode.Selection(
                    this.document.positionAt(range.from),
                    this.document.positionAt(range.to)
                )
        )
    }
    get visibleRanges(): readonly vscode.Range[] {
        return this.document.visibleRange
            ? [this.document.visibleRange]
            : // TODO: should we have a better default?
              []
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
            return this.params.edit(this.document.uri, callback, options)
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
