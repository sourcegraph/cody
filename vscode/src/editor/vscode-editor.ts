import * as vscode from 'vscode'

import {
    type ActiveTextEditor,
    type ActiveTextEditorDiagnostic,
    type ActiveTextEditorDiagnosticType,
    type ActiveTextEditorSelection,
    type ActiveTextEditorVisibleContent,
    type Editor,
    type RangeData,
    SURROUNDING_LINES,
    isCodyIgnoredFile,
} from '@sourcegraph/cody-shared'

import { CommandCodeLenses } from '../commands/services/code-lenses'
import { getEditor } from './active-editor'

export class VSCodeEditor implements Editor {
    constructor() {
        /**
         * Callback function that calls getEditor().active whenever the visible text editors change in VS Code.
         * This allows tracking of the currently active text editor even when focus moves to something like a webview panel.
         */
        vscode.window.onDidChangeActiveTextEditor(() => getEditor())
        new CommandCodeLenses()
    }

    public getWorkspaceRootUri(): vscode.Uri | null {
        const uri = getEditor().active?.document?.uri
        if (uri) {
            const wsFolder = vscode.workspace.getWorkspaceFolder(uri)
            if (wsFolder) {
                return wsFolder.uri
            }
        }
        return vscode.workspace.workspaceFolders?.[0]?.uri ?? null
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
            fileUri: documentUri,
            selectionRange: documentSelection.isEmpty ? undefined : documentSelection,
            ignored: isCodyIgnoredFile(activeEditor.document.uri),
        }
    }

    private getActiveTextEditorInstance(): vscode.TextEditor | null {
        const editor = getEditor()
        const activeEditor = editor.ignored ? null : getEditor().active
        return activeEditor ?? null
    }

    public getActiveTextEditorSelection(): ActiveTextEditorSelection | null {
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

    public async getTextEditorContentForFile(
        fileUri: vscode.Uri,
        selectionRange?: RangeData
    ): Promise<string | undefined> {
        if (!fileUri) {
            return undefined
        }

        let range: vscode.Range | undefined
        if (selectionRange) {
            const startLine = selectionRange?.start?.line
            let endLine = selectionRange?.end?.line
            if (startLine === endLine) {
                endLine++
            }
            range = new vscode.Range(startLine, 0, endLine, 0)
        }

        // Get the text from document by file Uri
        const vscodeUri = vscode.Uri.file(fileUri.fsPath)
        const doc = await vscode.workspace.openTextDocument(vscodeUri)
        return doc.getText(range)
    }

    private getActiveTextEditorDiagnosticType(
        severity: vscode.DiagnosticSeverity
    ): ActiveTextEditorDiagnosticType {
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

    public getActiveTextEditorDiagnosticsForRange({
        start,
        end,
    }: RangeData): ActiveTextEditorDiagnostic[] | null {
        const activeEditor = this.getActiveTextEditorInstance()
        if (!activeEditor) {
            return null
        }
        const diagnostics = vscode.languages.getDiagnostics(activeEditor.document.uri)
        const selectionRange = new vscode.Range(
            new vscode.Position(start.line, start.character),
            new vscode.Position(end.line, end.character)
        )

        return diagnostics
            .filter(diagnostic => selectionRange.contains(diagnostic.range))
            .map(({ message, range, severity }) => ({
                type: this.getActiveTextEditorDiagnosticType(severity),
                range,
                text: activeEditor.document.getText(range),
                message,
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
            new vscode.Range(
                selection.end,
                new vscode.Position(selection.end.line + SURROUNDING_LINES, 0)
            )
        )

        return {
            fileUri: activeEditor.document.uri,
            selectedText: activeEditor.document.getText(selection),
            precedingText,
            followingText,
            selectionRange: selection,
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
            fileUri: activeEditor.document.uri,
            content,
        }
    }

    public async createWorkspaceFile(content: string, uri?: vscode.Uri): Promise<void> {
        const fileUri = uri ?? (await vscode.window.showSaveDialog())
        if (!fileUri) {
            return
        }

        try {
            const workspaceEditor = new vscode.WorkspaceEdit()
            workspaceEditor.createFile(fileUri, { ignoreIfExists: true })
            // replace whole file with new content
            const range = new vscode.Range(0, 0, 9999, 0)
            workspaceEditor.replace(fileUri, range, content.trimEnd())
            await vscode.workspace.applyEdit(workspaceEditor)
            void vscode.commands.executeCommand('vscode.open', fileUri)
        } catch {
            const errorMsg = 'Failed to create new file.'
            await vscode.window.showInformationMessage(errorMsg)
        }
    }

    public async showWarningMessage(message: string): Promise<void> {
        await vscode.window.showWarningMessage(message)
    }
}
