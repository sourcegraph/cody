import * as vscode from 'vscode'

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

import { CommandsController } from '../custom-prompts/CommandsController'
import { FixupController } from '../non-stop/FixupController'
import { InlineController } from '../services/InlineController'

import { EditorCodeLenses } from './EditorCodeLenses'
import { getSmartSelection } from './utils'

export class VSCodeEditor implements Editor<InlineController, FixupController, CommandsController> {
    constructor(
        public readonly controllers: ActiveTextEditorViewControllers<
            InlineController,
            FixupController,
            CommandsController
        >
    ) {
        new EditorCodeLenses()
    }

    public get fileName(): string {
        return vscode.window.activeTextEditor?.document.fileName ?? ''
    }

    /** @deprecated Use {@link VSCodeEditor.getWorkspaceRootUri} instead. */
    public getWorkspaceRootPath(): string | null {
        const uri = this.getWorkspaceRootUri()
        return uri?.scheme === 'file' ? uri.fsPath : null
    }

    public getWorkspaceRootUri(): vscode.Uri | null {
        const uri = vscode.window.activeTextEditor?.document?.uri
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
            filePath: documentUri.fsPath,
            selectionRange: documentSelection.isEmpty ? undefined : documentSelection,
        }
    }

    public getActiveInlineChatTextEditor(): ActiveTextEditor | null {
        const inlineController = this.controllers.inline
        const documentUri = inlineController?.thread?.uri
        if (!inlineController?.isInProgress || !documentUri) {
            return null
        }
        const documentSelection = inlineController?.selectionRange
        // get text from the doc uri and selection range
        const documentText = vscode.workspace.textDocuments
            .find(doc => doc.uri.fsPath === documentUri.fsPath)
            ?.getText(documentSelection)

        return {
            content: documentText || '',
            filePath: documentUri.fsPath,
            selectionRange: documentSelection,
        }
    }

    public getActiveInlineChatSelection(): ActiveTextEditorSelection | null {
        const inlineChatEditor = this.getActiveInlineChatTextEditor()
        if (!inlineChatEditor) {
            return null
        }
        const activeEditor = vscode.window.visibleTextEditors.find(
            editor => editor.document.uri.fsPath === inlineChatEditor.filePath
        )
        const selectionRange = this.controllers.inline?.getSelectionRange()
        if (!activeEditor || !selectionRange) {
            return null
        }
        const selection = new vscode.Selection(selectionRange.start.line, 0, selectionRange.end.line + 1, 0)
        return this.createActiveTextEditorSelection(activeEditor, selection)
    }

    private getActiveTextEditorInstance(): vscode.TextEditor | null {
        const activeEditor = vscode.window.activeTextEditor
        return activeEditor ?? null
    }

    public getActiveTextEditorSelection(): ActiveTextEditorSelection | null {
        // Get selection from Inline Controller if there is an inline task in progress
        if (this.controllers.inline?.isInProgress) {
            return this.getActiveInlineChatSelection()
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

    /**
     * Gets the current smart selection for the active text editor.
     *
     * Checks if there is an existing selection and returns that if it exists.
     * Otherwise tries to get the folding range containing the cursor position.
     *
     * Returns null if no selection can be determined.
     *
     * @returns The smart selection for the active editor, or null if none can be determined.
     */
    public async getActiveTextEditorSmartSelection(): Promise<ActiveTextEditorSelection | null> {
        const activeEditor = this.getActiveTextEditorInstance()
        if (!activeEditor) {
            return null
        }
        const selection = activeEditor.selection
        if (!selection?.start.line) {
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
        // Get selection from Inline Controller if there is an inline task in progress
        if (this.controllers.inline?.isInProgress) {
            return this.getActiveInlineChatSelection()
        }
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
            fileName: vscode.workspace.asRelativePath(activeEditor.document.uri.fsPath),
            selectedText: activeEditor.document.getText(selection),
            precedingText,
            followingText,
            selectionRange: selection,
            fileUri: activeEditor.document.uri,
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
            fileUri: activeEditor.document.uri,
            content,
        }
    }

    public async replaceSelection(fileName: string, selectedText: string, replacement: string): Promise<void> {
        const activeEditor = this.getActiveTextEditorInstance()
        // Use the replace method from inline controller if there is a Inline Fixsup in progress
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

    // TODO: When Non-Stop Fixup doesn't depend directly on the chat view,
    // move the recipe to vscode and remove this entrypoint.
    public async didReceiveFixupText(id: string, text: string, state: 'streaming' | 'complete'): Promise<void> {
        if (!this.controllers.fixups) {
            throw new Error('no fixup controller')
        }
        await this.controllers.fixups.didReceiveFixupText(id, text, state)
    }
}
