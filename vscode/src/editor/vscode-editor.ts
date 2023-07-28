import { spawnSync } from 'child_process'

import * as vscode from 'vscode'

import type {
    ActiveTextEditor,
    ActiveTextEditorSelection,
    ActiveTextEditorViewControllers,
    ActiveTextEditorVisibleContent,
    Editor,
} from '@sourcegraph/cody-shared/src/editor'
import { SURROUNDING_LINES } from '@sourcegraph/cody-shared/src/prompt/constants'
import { convertGitCloneURLToCodebaseName } from '@sourcegraph/cody-shared/src/utils'

import type { MyPromptController } from '../my-cody/MyPromptController'
import type { FixupController } from '../non-stop/FixupController'
import type { InlineController } from '../services/InlineController'

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

        const args: ActiveTextEditor = {
            content: documentText,
            filePath: documentUri.fsPath,
            selection: !documentSelection.isEmpty ? documentSelection : undefined,
        }

        const workspaceRoot = this.getWorkspaceRootPath()
        if (!workspaceRoot) {
            return args
        }

        const remote = runGitCommand(['remote', 'get-url', 'origin'], workspaceRoot)
        const repoName = convertGitCloneURLToCodebaseName(remote) || ''
        const revision = runGitCommand(['rev-parse', 'HEAD'], workspaceRoot)

        return { ...args, repoName, revision }
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

function runGitCommand(args: string[], workspaceRoot: string): string {
    return spawnSync('git', args, { cwd: workspaceRoot }).stdout.toString().trim()
}
