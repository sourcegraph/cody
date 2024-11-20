import * as vscode from 'vscode'
import {
    type AutoeditsDecorator,
    type DecorationStrategyIdentifier,
    createAutoeditsDecorator,
} from './decorators/base'
import { getDecorationInformation } from './diff-utils'

/**
 * Represents a proposed text change in the editor.
 */
interface ProposedChange {
    // The URI of the document for which the change is proposed
    uri: string

    // The range in the document that will be modified
    range: vscode.Range

    // The text that will replace the content in the range if accepted
    prediction: string

    // The renderer responsible for decorating the proposed change
    decorator: AutoeditsDecorator
}

/**
 * Options for rendering auto-edits in the editor.
 */
export interface AutoEditsManagerOptions {
    // The document where the auto-edit will be rendered
    document: vscode.TextDocument

    // The range in the document that will be modified with the predicted text
    range: vscode.Range

    // The predicted text that will replace the current text in the range
    prediction: string

    // The current text content of the file
    currentFileText: string

    // The predicted/suggested text that will replace the current text
    predictedFileText: string
}

export class AutoEditsRendererManager implements vscode.Disposable {
    // Keeps track of the current active edit (there can only be one active edit at a time)
    private activeEdit: ProposedChange | null = null
    private readonly decoratorStrategyIdentifier: DecorationStrategyIdentifier
    private disposables: vscode.Disposable[] = []

    constructor(decoratorStrategyIdentifier: DecorationStrategyIdentifier) {
        this.decoratorStrategyIdentifier = decoratorStrategyIdentifier
        this.disposables.push(
            vscode.commands.registerCommand('cody.supersuggest.accept', () => this.acceptEdit()),
            vscode.commands.registerCommand('cody.supersuggest.dismiss', () => this.dismissEdit()),
            vscode.workspace.onDidChangeTextDocument(event => this.onDidChangeTextDocument(event)),
            vscode.window.onDidChangeTextEditorSelection(event =>
                this.onDidChangeTextEditorSelection(event)
            ),
            vscode.window.onDidChangeActiveTextEditor(editor =>
                this.onDidChangeActiveTextEditor(editor)
            ),
            vscode.workspace.onDidCloseTextDocument(document => this.onDidCloseTextDocument(document))
        )
    }

    public hasActiveEdit(): boolean {
        return this.activeEdit !== null
    }

    public async showEdit(options: AutoEditsManagerOptions): Promise<void> {
        await this.dismissEdit()
        const editor = vscode.window.activeTextEditor
        if (!editor || options.document !== editor.document) {
            return
        }
        this.activeEdit = {
            uri: options.document.uri.toString(),
            range: options.range,
            prediction: options.prediction,
            decorator: createAutoeditsDecorator(this.decoratorStrategyIdentifier, editor),
        }
        const decorationInformation = getDecorationInformation(
            options.currentFileText,
            options.predictedFileText
        )
        this.activeEdit.decorator.setDecorations(decorationInformation)
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
    }

    private async dismissEdit(): Promise<void> {
        const decorator = this.activeEdit?.decorator
        if (decorator) {
            decorator.clearDecorations()
            decorator.dispose()
        }
        this.activeEdit = null
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', false)
    }

    private async acceptEdit(): Promise<void> {
        const editor = vscode.window.activeTextEditor
        if (!this.activeEdit || !editor || editor.document.uri.toString() !== this.activeEdit.uri) {
            await this.dismissEdit()
            return
        }
        await editor.edit(editBuilder => {
            editBuilder.replace(this.activeEdit!.range, this.activeEdit!.prediction)
        })
        await this.dismissEdit()
    }

    private async onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): Promise<void> {
        // Only dismiss if we have an active suggestion and the changed document matches
        // else, we will falsely discard the suggestion on unrelated changes such as changes in output panel.
        if (event.document.uri.toString() !== this.activeEdit?.uri) {
            return
        }
        await this.dismissEdit()
    }

    private async onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined): Promise<void> {
        if (!editor || editor.document.uri.toString() !== this.activeEdit?.uri) {
            await this.dismissEdit()
        }
    }

    private async onDidCloseTextDocument(document: vscode.TextDocument): Promise<void> {
        if (document.uri.toString() === this.activeEdit?.uri) {
            await this.dismissEdit()
        }
    }

    private async onDidChangeTextEditorSelection(
        event: vscode.TextEditorSelectionChangeEvent
    ): Promise<void> {
        if (event.textEditor.document.uri.toString() !== this.activeEdit?.uri) {
            return
        }
        const currentSelectionRange = event.selections.at(-1)
        if (!currentSelectionRange?.intersection(this.activeEdit.range)) {
            await this.dismissEdit()
        }
    }

    public dispose(): void {
        this.dismissEdit()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
