import * as vscode from 'vscode'

import type { DocumentContext } from '@sourcegraph/cody-shared'

import { completionMatchesSuffix } from '../../completions/is-completion-visible'
import { type AutoeditRequestID, autoeditAnalyticsLogger } from '../analytics-logger'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { CodeToReplaceData } from '../prompt/prompt-utils'
import {
    adjustPredictionIfInlineCompletionPossible,
    areSameUriDocs,
    extractInlineCompletionFromRewrittenCode,
} from '../utils'

import type { AutoEditsDecorator, DecorationInfo } from './decorators/base'

export interface TryMakeInlineCompletionsArgs {
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
     */
    tryMakeInlineCompletions({
        prediction,
        codeToReplaceData,
        document,
        position,
        docContext,
        decorationInfo,
    }: TryMakeInlineCompletionsArgs): {
        /**
         * `null` if no inline completion items should be rendered
         */
        inlineCompletionItems: vscode.InlineCompletionItem[] | null
        /**
         * `null` if no inline decoration should be rendered
         */
        updatedDecorationInfo: DecorationInfo | null
        updatedPrediction: string
    }

    handleDidShowSuggestion(requestId: AutoeditRequestID): Promise<void>

    /**
     * Renders the prediction as inline decorations.
     */
    renderInlineDecorations(decorationInfo: DecorationInfo): Promise<void>

    /**
     * Determines if we have a rendered autoedit suggested.
     */
    hasActiveEdit(): boolean

    /**
     * Dismissed an active edit and frees resources.
     */
    dispose(): void
}

export const AUTOEDIT_VISIBLE_DELAY_MS = 750

export class AutoEditsDefaultRendererManager implements AutoEditsRendererManager {
    // Keeps track of the current active edit (there can only be one active edit at a time)
    protected activeRequestId: AutoeditRequestID | null = null
    protected disposables: vscode.Disposable[] = []
    protected decorator: AutoEditsDecorator | null = null
    /**
     * The amount of time before we consider a suggestion to be "visible" to the user.
     */
    private autoeditSuggestedTimeoutId: NodeJS.Timeout | undefined

    constructor(protected createDecorator: (editor: vscode.TextEditor) => AutoEditsDecorator) {
        this.disposables.push(
            vscode.commands.registerCommand('cody.supersuggest.accept', () => this.acceptEdit()),
            vscode.commands.registerCommand('cody.supersuggest.dismiss', () => this.rejectEdit()),
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

    protected onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        // Only dismiss if we have an active suggestion and the changed document matches
        // else, we will falsely discard the suggestion on unrelated changes such as changes in output panel.
        if (areSameUriDocs(event.document, this.activeRequest?.document)) {
            this.rejectEdit()
        }
    }

    protected onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined): void {
        if (!editor || !areSameUriDocs(editor.document, this.activeRequest?.document)) {
            this.rejectEdit()
        }
    }

    protected onDidCloseTextDocument(document: vscode.TextDocument): void {
        if (areSameUriDocs(document, this.activeRequest?.document)) {
            this.rejectEdit()
        }
    }

    protected onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): void {
        if (
            this.activeRequest &&
            areSameUriDocs(event.textEditor.document, this.activeRequest?.document)
        ) {
            const currentSelectionRange = event.selections.at(-1)
            if (!currentSelectionRange?.intersection(this.activeRequest.codeToReplaceData.range)) {
                this.rejectEdit()
            }
        }
    }

    protected get activeRequest() {
        if (this.activeRequestId) {
            const request = autoeditAnalyticsLogger.getRequest(this.activeRequestId)
            if (request && 'decorationInfo' in request && this.decorator) {
                return request
            }
        }
        return undefined
    }

    public hasActiveEdit(): boolean {
        return this.activeRequestId !== null
    }

    public async handleDidShowSuggestion(requestId: AutoeditRequestID): Promise<void> {
        await this.rejectEdit()

        this.activeRequestId = requestId
        this.decorator = this.createDecorator(vscode.window.activeTextEditor!)

        autoeditAnalyticsLogger.markAsSuggested(requestId)

        // Clear any existing timeouts, only one suggestion can be shown at a time
        clearTimeout(this.autoeditSuggestedTimeoutId)

        // Mark suggestion as read after a delay if it's still visible.
        this.autoeditSuggestedTimeoutId = setTimeout(() => {
            // TODO: use `isCompletionVisible` logic or similar to account for cases
            // where a partially accepted inline completion item is still visible.
            if (this.activeRequest?.requestId === requestId) {
                autoeditAnalyticsLogger.markAsRead(requestId)
            }
        }, AUTOEDIT_VISIBLE_DELAY_MS)
    }

    protected async handleDidHideSuggestion(): Promise<void> {
        if (this.activeRequest && this.decorator) {
            // Hide inline decorations
            this.decorator.dispose()
            await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', false)

            // Hide inline completion provider item ghost text
            await vscode.commands.executeCommand('editor.action.inlineSuggest.hide')
        }

        this.activeRequestId = null
        this.decorator = null
    }

    protected async acceptEdit(): Promise<void> {
        const editor = vscode.window.activeTextEditor
        const { activeRequest } = this
        if (
            !editor ||
            !activeRequest ||
            !areSameUriDocs(editor.document, this.activeRequest?.document)
        ) {
            return this.rejectEdit()
        }

        await editor.edit(editBuilder => {
            editBuilder.replace(activeRequest.codeToReplaceData.range, activeRequest.prediction)
        })

        autoeditAnalyticsLogger.markAsAccepted(activeRequest.requestId)
        await this.handleDidHideSuggestion()
    }

    protected async rejectEdit(): Promise<void> {
        if (this.activeRequest) {
            autoeditAnalyticsLogger.markAsRejected(this.activeRequest.requestId)
            await this.handleDidHideSuggestion()
        }
    }

    public async renderInlineDecorations(decorationInfo: DecorationInfo): Promise<void> {
        this.decorator?.setDecorations(decorationInfo)
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
    }

    tryMakeInlineCompletions({
        prediction,
        codeToReplaceData,
        document,
        position,
        docContext,
        decorationInfo,
    }: TryMakeInlineCompletionsArgs): {
        inlineCompletionItems: vscode.InlineCompletionItem[] | null
        updatedDecorationInfo: DecorationInfo | null
        updatedPrediction: string
    } {
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
                'tryMakeInlineCompletions',
                'Autocomplete Inline Response: ',
                autocompleteResponse
            )
            return {
                inlineCompletionItems: [inlineCompletionItem],
                updatedDecorationInfo: null,
                updatedPrediction,
            }
        }
        autoeditsOutputChannelLogger.logDebug(
            'tryMakeInlineCompletions',
            'Rendering a diff view for auto-edits.'
        )

        return {
            inlineCompletionItems: null,
            updatedDecorationInfo: decorationInfo,
            updatedPrediction: updatedPrediction,
        }
    }

    public dispose(): void {
        this.rejectEdit()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
