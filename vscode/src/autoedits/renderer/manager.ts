import * as vscode from 'vscode'

import type { DocumentContext } from '@sourcegraph/cody-shared'

import { completionMatchesSuffix } from '../../completions/is-completion-visible'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { CodeToReplaceData } from '../prompt/prompt-utils'
import {
    adjustPredictionIfInlineCompletionPossible,
    extractInlineCompletionFromRewrittenCode,
} from '../utils'

import type { AutoEditsDecorator, DecorationInfo } from './decorators/base'

/**
 * Represents a proposed text change in the editor.
 */
export interface ProposedChange {
    // The URI of the document for which the change is proposed
    uri: string

    // The range in the document that will be modified
    range: vscode.Range

    // The text that will replace the content in the range if accepted
    prediction: string

    // The renderer responsible for decorating the proposed change
    decorator: AutoEditsDecorator
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

    decorationInfo: DecorationInfo
}

export interface AutoeditRendererManagerArgs {
    prediction: string
    codeToReplaceData: CodeToReplaceData
    document: vscode.TextDocument
    position: vscode.Position
    docContext: DocumentContext
    decorationInfo: DecorationInfo
}

/**
 * This is a temporary split while we have to maintain two renderer, the default one and the inline one.
 * I (valery) plan to iterate on this interface in a follow up PRs and it most probably will be removed
 * if the inline renderer implementation won't see dogfood blockers.
 */
export interface AutoEditsRendererManager extends vscode.Disposable {
    /**
     * Tries to extract inline completions from the prediction data and returns them if they are available.
     * Depending on the renderer type might also render line decoration.
     */
    maybeRenderDecorationsAndTryMakeInlineCompletionResponse({
        prediction,
        codeToReplaceData,
        document,
        position,
        docContext,
        decorationInfo,
    }: AutoeditRendererManagerArgs): Promise<{
        inlineCompletions: vscode.InlineCompletionItem[] | null
        updatedDecorationInfo: DecorationInfo
    }>

    /**
     * Determines if we have a rendered autoedit suggested.
     */
    hasActiveEdit(): boolean

    /**
     * Dismissed an active edit and frees resources.
     */
    dispose(): void
}

export class AutoEditsDefaultRendererManager implements AutoEditsRendererManager {
    // Keeps track of the current active edit (there can only be one active edit at a time)
    protected activeEdit: ProposedChange | null = null
    protected disposables: vscode.Disposable[] = []

    constructor(protected createDecorator: (editor: vscode.TextEditor) => AutoEditsDecorator) {
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

    async showEdit({
        document,
        range,
        prediction,
        decorationInfo,
    }: AutoEditsManagerOptions): Promise<void> {
        await this.dismissEdit()
        const editor = vscode.window.activeTextEditor
        if (!editor || document !== editor.document) {
            return
        }
        this.activeEdit = {
            uri: document.uri.toString(),
            range: range,
            prediction: prediction,
            decorator: this.createDecorator(editor),
        }
        this.activeEdit.decorator.setDecorations(decorationInfo)
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
    }

    protected async dismissEdit(): Promise<void> {
        const decorator = this.activeEdit?.decorator
        if (decorator) {
            decorator.dispose()
        }
        this.activeEdit = null
        await vscode.commands.executeCommand('editor.action.inlineSuggest.hide')
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', false)
    }

    protected async acceptEdit(): Promise<void> {
        const editor = vscode.window.activeTextEditor
        if (!this.activeEdit || !editor || editor.document.uri.toString() !== this.activeEdit.uri) {
            await this.dismissEdit()
            return
        }
        // TODO: granularly handle acceptance for inline renreder, where part of the suggestion
        // might be inserted by the inline completion item provider.
        await editor.edit(editBuilder => {
            editBuilder.replace(this.activeEdit!.range, this.activeEdit!.prediction)
        })
        await this.dismissEdit()
    }

    protected async onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): Promise<void> {
        // Only dismiss if we have an active suggestion and the changed document matches
        // else, we will falsely discard the suggestion on unrelated changes such as changes in output panel.
        if (event.document.uri.toString() !== this.activeEdit?.uri) {
            return
        }
        await this.dismissEdit()
    }

    protected async onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined): Promise<void> {
        if (!editor || editor.document.uri.toString() !== this.activeEdit?.uri) {
            await this.dismissEdit()
        }
    }

    protected async onDidCloseTextDocument(document: vscode.TextDocument): Promise<void> {
        if (document.uri.toString() === this.activeEdit?.uri) {
            await this.dismissEdit()
        }
    }

    protected async onDidChangeTextEditorSelection(
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

    async maybeRenderDecorationsAndTryMakeInlineCompletionResponse({
        prediction,
        codeToReplaceData,
        document,
        position,
        docContext,
        decorationInfo,
    }: AutoeditRendererManagerArgs): Promise<{
        inlineCompletions: vscode.InlineCompletionItem[] | null
        updatedDecorationInfo: DecorationInfo
    }> {
        const updatedPrediction = adjustPredictionIfInlineCompletionPossible(
            prediction,
            codeToReplaceData.codeToRewritePrefix,
            codeToReplaceData.codeToRewriteSuffix
        )
        const codeToRewriteAfterCurrentLine = codeToReplaceData.codeToRewriteSuffix.slice(
            docContext.currentLineSuffix.length + 1 // Additional char for newline
        )
        const isPrefixMatch = updatedPrediction.startsWith(codeToReplaceData.codeToRewritePrefix)
        const isSuffixMatch =
            // The current line suffix should not require any char removals to render the completion.
            completionMatchesSuffix({ insertText: updatedPrediction }, docContext.currentLineSuffix) &&
            // The new lines suggested after the current line must be equal to the prediction.
            updatedPrediction.endsWith(codeToRewriteAfterCurrentLine)

        if (isPrefixMatch && isSuffixMatch) {
            const autocompleteInlineResponse = extractInlineCompletionFromRewrittenCode(
                updatedPrediction,
                codeToReplaceData.codeToRewritePrefix,
                codeToReplaceData.codeToRewriteSuffix
            )
            const autocompleteResponse = docContext.currentLinePrefix + autocompleteInlineResponse
            const inlineCompletionItem = new vscode.InlineCompletionItem(
                autocompleteResponse,
                new vscode.Range(
                    document.lineAt(position).range.start,
                    document.lineAt(position).range.end
                )
            )
            autoeditsOutputChannelLogger.logDebug(
                'maybeRenderDecorationsAndTryMakeInlineCompletionResponse',
                'Autocomplete Inline Response: ',
                autocompleteResponse
            )
            return { inlineCompletions: [inlineCompletionItem], updatedDecorationInfo: decorationInfo }
        }

        await this.showEdit({
            document,
            range: codeToReplaceData.range,
            prediction: updatedPrediction,
            decorationInfo,
        })

        return { inlineCompletions: null, updatedDecorationInfo: decorationInfo }
    }

    public dispose(): void {
        this.dismissEdit()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
