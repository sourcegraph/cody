import * as vscode from 'vscode'

import {
    ActiveTextEditor,
    ActiveTextEditorDiagnostic,
    ActiveTextEditorDiagnosticType,
    ActiveTextEditorSelection,
    ActiveTextEditorViewControllers,
    ActiveTextEditorVisibleContent,
    Editor,
} from '@sourcegraph/cody-shared/src/editor'
import { SURROUNDING_LINES } from '@sourcegraph/cody-shared/src/prompt/constants'

import { MyPromptController } from '../my-cody/MyPromptController'
import { FixupController } from '../non-stop/FixupController'
import { InlineController } from '../services/InlineController'

export class VSCodeEditor implements Editor<InlineController, FixupController, MyPromptController> {
    constructor(
        public readonly controllers: ActiveTextEditorViewControllers<
            InlineController,
            FixupController,
            MyPromptController
        >
    ) {}

    public get fileName(): string {
        return vscode.window.activeTextEditor?.document.fileName ?? ''
    }

    public getWorkspaceRootPath(): string | null {
        const uri = vscode.window.activeTextEditor?.document?.uri
        if (uri) {
            const wsFolder = vscode.workspace.getWorkspaceFolder(uri)
            if (wsFolder) {
                return wsFolder.uri.fsPath
            }
        }
        return vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? null
    }

    public getActiveTextEditor(): ActiveTextEditor | null {
        const activeEditor = this.getActiveTextEditorInstance()
        if (!activeEditor) {
            return null
        }
        const documentUri = activeEditor.document.uri
        const documentText = activeEditor.document.getText()
        const documentSelection = activeEditor.selection

        return {
            content: documentText,
            filePath: documentUri.fsPath,
            selection: !documentSelection.isEmpty ? documentSelection : undefined,
        }
    }

    private getActiveTextEditorInstance(): vscode.TextEditor | null {
        const activeEditor = vscode.window.activeTextEditor
        return activeEditor ?? null
    }

    public getActiveTextEditorSelection(): ActiveTextEditorSelection | null {
        if (this.controllers.inline?.isInProgress) {
            return null
        }
        const activeEditor = this.getActiveTextEditorInstance()
        if (!activeEditor) {
            return null
        }
        const selection = activeEditor.selection
        if (!selection || selection?.start.isEqual(selection.end)) {
            return null
        }
        return this.createActiveTextEditorSelection(activeEditor, selection)
    }

    public getActiveTextEditorSelectionOrEntireFile(): ActiveTextEditorSelection | null {
        const activeEditor = this.getActiveTextEditorInstance()
        if (!activeEditor) {
            return null
        }
        let selection = activeEditor.selection
        if (!selection || selection.isEmpty) {
            selection = new vscode.Selection(0, 0, activeEditor.document.lineCount, 0)
        }
        return this.createActiveTextEditorSelection(activeEditor, selection)
    }

    private getActiveTextEditorDiagnosticType(severity: vscode.DiagnosticSeverity): ActiveTextEditorDiagnosticType {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error:
                return 'error'
            case vscode.DiagnosticSeverity.Warning:
                return 'warning'
            case vscode.DiagnosticSeverity.Information:
                return 'information'
            case vscode.DiagnosticSeverity.Hint:
                return 'hint'
        }
    }

    public getActiveTextEditorDiagnosticsForSelectionOrEntireFile(): ActiveTextEditorDiagnostic[] | null {
        const activeEditor = this.getActiveTextEditorInstance()
        if (!activeEditor) {
            return null
        }

        const diagnostics = vscode.languages.getDiagnostics(activeEditor.document.uri)
        // TODO(umpox): Inline edits currently don't use the active editor selection
        // Need to fix this so inline edits only consume diagnostics for the current line
        // if (activeEditor.selection) {
        //     console.log('Filtering for selection!', diagnostics, activeEditor.selection)
        //     diagnostics = diagnostics.filter(({ range }) => range.contains(activeEditor.selection))
        // }

        return diagnostics.map(({ message, range, severity }) => ({
            range,
            message,
            type: this.getActiveTextEditorDiagnosticType(severity),
        }))
    }

    private createActiveTextEditorSelection(
        activeEditor: vscode.TextEditor,
        selection: vscode.Selection
    ): ActiveTextEditorSelection {
        const precedingText = activeEditor.document.getText(
            new vscode.Range(
                new vscode.Position(Math.max(0, selection.start.line - SURROUNDING_LINES), 0),
                selection.start
            )
        )
        const followingText = activeEditor.document.getText(
            new vscode.Range(selection.end, new vscode.Position(selection.end.line + SURROUNDING_LINES, 0))
        )

        return {
            fileName: vscode.workspace.asRelativePath(activeEditor.document.uri.fsPath),
            selectedText: activeEditor.document.getText(selection),
            precedingText,
            followingText,
        }
    }

    public getActiveTextEditorVisibleContent(): ActiveTextEditorVisibleContent | null {
        const activeEditor = this.getActiveTextEditorInstance()
        if (!activeEditor) {
            return null
        }

        const visibleRanges = activeEditor.visibleRanges
        if (visibleRanges.length === 0) {
            return null
        }

        const visibleRange = visibleRanges[0]
        const content = activeEditor.document.getText(
            new vscode.Range(
                new vscode.Position(visibleRange.start.line, 0),
                new vscode.Position(visibleRange.end.line + 1, 0)
            )
        )

        return {
            fileName: vscode.workspace.asRelativePath(activeEditor.document.uri.fsPath),
            content,
        }
    }

    public async replaceSelection(fileName: string, selectedText: string, replacement: string): Promise<void> {
        const activeEditor = this.getActiveTextEditorInstance()
        if (this.controllers.inline?.isInProgress) {
            await this.controllers.inline.replace(fileName, replacement, selectedText)
            return
        }
        if (!activeEditor || vscode.workspace.asRelativePath(activeEditor.document.uri.fsPath) !== fileName) {
            // TODO: should return something indicating success or failure
            console.error('Missing file')
            return
        }
        const selection = activeEditor.selection
        if (!selection) {
            console.error('Missing selection')
            return
        }
        if (activeEditor.document.getText(selection) !== selectedText) {
            // TODO: Be robust to this.
            await vscode.window.showInformationMessage(
                'The selection changed while Cody was working. The text will not be edited.'
            )
            return
        }

        // Editing the document
        await activeEditor.edit(edit => {
            edit.replace(selection, replacement)
        })

        return
    }

    public async showQuickPick(labels: string[]): Promise<string | undefined> {
        const label = await vscode.window.showQuickPick(labels)
        return label
    }

    public async showWarningMessage(message: string): Promise<void> {
        await vscode.window.showWarningMessage(message)
    }

    public async showInputBox(prompt?: string): Promise<string | undefined> {
        return vscode.window.showInputBox({
            placeHolder: prompt || 'Enter here...',
        })
    }

    // TODO: When Non-Stop Fixup doesn't depend directly on the chat view,
    // move the recipe to vscode and remove this entrypoint.
    public async didReceiveFixupText(id: string, text: string, state: 'streaming' | 'complete'): Promise<void> {
        if (!this.controllers.fixups) {
            throw new Error('no fixup controller')
        }
        await this.controllers.fixups.didReceiveFixupText(id, text, state)
    }
}
