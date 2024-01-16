import * as vscode from 'vscode'

import { isCodyIgnoredFile } from '@sourcegraph/cody-shared/src/chat/context-filter'
import type {
    ActiveTextEditor,
    ActiveTextEditorDiagnostic,
    ActiveTextEditorDiagnosticType,
    ActiveTextEditorSelection,
    ActiveTextEditorSelectionRange,
    ActiveTextEditorViewControllers,
    ActiveTextEditorVisibleContent,
    Editor,
} from '@sourcegraph/cody-shared/src/editor'
import { SURROUNDING_LINES } from '@sourcegraph/cody-shared/src/prompt/constants'

import { type CommandsController } from '../commands/CommandsController'

import { getEditor } from './active-editor'
import { EditorCodeLenses } from './EditorCodeLenses'
import { getSmartSelection } from './utils'

export class VSCodeEditor implements Editor<CommandsController> {
    constructor(public readonly controllers: ActiveTextEditorViewControllers<CommandsController>) {
        /**
         * Callback function that calls getEditor().active whenever the visible text editors change in VS Code.
         * This allows tracking of the currently active text editor even when focus moves to something like a webview panel.
         */
        vscode.window.onDidChangeActiveTextEditor(() => getEditor())
        new EditorCodeLenses()
    }

    /**
     * @deprecated Use {@link VSCodeEditor.getWorkspaceRootUri} instead
    /** NOTE DO NOT UES - this does not work with chat webview panel
     */
    public getWorkspaceRootPath(): string | null {
        const uri = this.getWorkspaceRootUri()
        return uri?.scheme === 'file' ? uri.fsPath : null
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

    /**
     * Gets the current smart selection for the active text editor.
     *
     * Checks if there is an existing selection and returns that if it exists.
     * Otherwise tries to get the folding range containing the cursor position.
     *
     * Returns null if no selection can be determined.
     * @returns The smart selection for the active editor, or null if none can be determined.
     */
    public async getActiveTextEditorSmartSelection(): Promise<ActiveTextEditorSelection | null> {
        const activeEditor = this.getActiveTextEditorInstance()
        if (!activeEditor) {
            return null
        }
        const selection = activeEditor.selection
        if (!selection.start) {
            return null
        }

        if (selection && !selection?.start.isEqual(selection.end)) {
            return this.createActiveTextEditorSelection(activeEditor, selection)
        }

        // Get selection for current folding range of cursor
        const activeCursorPosition = selection.start.line
        const foldingRange = await getSmartSelection(activeEditor.document.uri, activeCursorPosition)
        if (foldingRange) {
            return this.createActiveTextEditorSelection(activeEditor, foldingRange)
        }

        return null
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

    public getActiveTextEditorSelectionOrVisibleContent(): ActiveTextEditorSelection | null {
        const activeEditor = this.getActiveTextEditorInstance()
        if (!activeEditor) {
            return null
        }
        let selection = activeEditor.selection
        if (selection && !selection.isEmpty) {
            return this.createActiveTextEditorSelection(activeEditor, selection)
        }
        const visibleRanges = activeEditor.visibleRanges
        if (visibleRanges.length === 0) {
            return null
        }

        const visibleRange = visibleRanges[0]
        selection = new vscode.Selection(visibleRange.start.line, 0, visibleRange.end.line + 1, 0)
        if (!selection || selection.isEmpty) {
            return null
        }

        return this.createActiveTextEditorSelection(activeEditor, selection)
    }

    public async getTextEditorContentForFile(
        fileUri: vscode.Uri,
        selectionRange?: ActiveTextEditorSelectionRange
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

    public getActiveTextEditorDiagnosticsForRange({
        start,
        end,
    }: ActiveTextEditorSelectionRange): ActiveTextEditorDiagnostic[] | null {
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
            new vscode.Range(selection.end, new vscode.Position(selection.end.line + SURROUNDING_LINES, 0))
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

    public async replaceSelection(fileName: string, selectedText: string, replacement: string): Promise<void> {
        const activeEditor = this.getActiveTextEditorInstance()
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
}
