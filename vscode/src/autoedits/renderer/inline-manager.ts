import type * as vscode from 'vscode'

import { autoeditAcceptReason, autoeditRejectReason } from '../analytics-logger'
import { areSameUriDocs } from '../utils'

import { AutoEditsDefaultRendererManager, type AutoEditsRendererManager } from './manager'
import type { AutoEditRenderOutput, GetRenderOutputArgs } from './render-output'

/**
 * For now `AutoEditsInlineRendererManager` is the same as `AutoEditsDefaultRendererManager` and the
 * only major difference is in `tryMakeInlineCompletionResponse` implementation.
 *
 * This extra manager will be removed once we won't have a need to maintain two diff renderers.
 * Currently, it is used to enable the experimental usage of the `InlineDiffDecorator`.
 */
export class AutoEditsInlineRendererManager
    extends AutoEditsDefaultRendererManager
    implements AutoEditsRendererManager
{
    public getRenderOutput(args: GetRenderOutputArgs): AutoEditRenderOutput {
        const completionsWithDecorations = this.getCompletionsWithPossibleDecorationsRenderOutput(args)
        if (completionsWithDecorations) {
            return completionsWithDecorations
        }

        if (this.shouldRenderDecorations(args.decorationInfo)) {
            return {
                type: 'decorations',
                decorations: {
                    ...this.getInlineDecorations(args.decorationInfo),
                    // No need to show insertion marker when only using inline decorations
                    insertMarkerDecorations: [],
                },
            }
        }

        // We have determined that the diff requires rendering as an image for the optimal user experience.
        // Additions are entirely represented with the image, and deletions are shown as decorations.
        const { deletionDecorations } = this.getInlineDecorations(args.decorationInfo)
        const { insertionDecorations, insertMarkerDecorations } = this.createModifiedImageDecorations(
            args.document,
            args.decorationInfo,
            args.requestId
        )
        return {
            type: 'image',
            decorations: {
                insertionDecorations,
                insertMarkerDecorations,
                deletionDecorations,
            },
        }
    }

    public hasInlineCompletionItems(): boolean {
        if (!this.activeRequest) {
            return false
        }
        return ['completion', 'completion-with-decorations'].includes(
            this.activeRequest.renderOutput.type
        )
    }

    public hasInlineDecorations(): boolean {
        if (!this.activeRequest) {
            return false
        }

        return (
            this.activeRequest.renderOutput.type === 'completion-with-decorations' ||
            this.hasInlineDecorationOnly()
        )
    }

    /**
     * Given a document change event, determines if the change matches the active request.
     * If it does, we should treat this as a user acceptance of the suggestion.
     *
     * IMPORTANT:
     * This logic also helps with a race condition where VS Code makes the insertion before notifying us
     * that the completion was accepted. For example, VS Code calls `onDidChangeTextDocument` before
     * `cody.supersuggest.accept`.
     * By checking if the inserted changes match the active request, we ensure that we always reliably accept
     * completions despite this race condition.
     */
    private documentChangesMatchesActiveRequest(event: vscode.TextDocumentChangeEvent): boolean {
        const { activeRequest } = this
        if (!activeRequest) {
            return false
        }

        if (event.contentChanges.length === 0) {
            // No changes to match
            return false
        }

        if (activeRequest.renderOutput.type === 'completion') {
            // Completions are inserted to the document differently, so handle their specific ranges
            // so we can intercept them.
            return activeRequest.renderOutput.inlineCompletionItems.every(completion => {
                if (!completion.range || !completion.insertText) {
                    return false
                }
                const { range, insertText } = completion
                return event.contentChanges.some(
                    change => change.range.isEqual(range) && change.text === insertText
                )
            })
        }

        return event.contentChanges.some(
            change =>
                change.range.isEqual(activeRequest.codeToReplaceData.range) &&
                change.text === activeRequest.prediction
        )
    }

    protected onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        if (!this.activeRequest) {
            return
        }

        if (!areSameUriDocs(event.document, this.activeRequest.document)) {
            return
        }

        if (this.documentChangesMatchesActiveRequest(event)) {
            // For completions, onDidChangeTextDocument is called BEFORE `cody.supersuggest.accept`
            // For edits, onDidChangeTextDocument is called AFTER `cody.supersuggest.accept`
            // Due to this difference, we rely on `documentChangesMatchesActiveRequest` to determine if a completion
            // was accepted, otherwise we will reject it on the assunption that the user made other changes.
            // We cannot reliably tell if, at this point, the reason the completion was accepted.
            const reason =
                this.activeRequest.renderOutput.type === 'completion'
                    ? autoeditAcceptReason.unknown
                    : autoeditAcceptReason.onDidChangeTextDocument
            // We have intercepted a document change that matches the active request.
            // Accept the edit and dismiss the suggestion.
            this.acceptActiveEdit(reason)
            return
        }

        if (this.hasInlineDecorations()) {
            // We are showing inline decorations, we should dismiss the suggestion.
            this.rejectActiveEdit(autoeditRejectReason.onDidChangeTextDocument)
            return
        }
    }

    protected async onDidChangeTextEditorSelection(
        event: vscode.TextEditorSelectionChangeEvent
    ): Promise<void> {
        if (!this.activeRequest) {
            return
        }

        if (!areSameUriDocs(event.textEditor.document, this.activeRequest.document)) {
            return
        }

        if (this.hasInlineCompletionItems()) {
            // We are showing a completion. The dismissal of the completion will
            // automatically be handled by VS Code. We must match that behaviour for any decorations,
            // otherwise we will end up with a scenario where the decorations of a suggestion are preserved,
            // whilst the completion has already been dismissed.
            // If the cursor moved in any file, we assume it's a user action and
            // dismiss the active edit.
            this.rejectActiveEdit(autoeditRejectReason.onDidChangeTextEditorSelection)
        }

        if (this.hasInlineDecorationOnly()) {
            // We are only showing decorations. We can handle this entirely ourselves.
            // We will only dismiss the suggestion if the user moves the cursor outside of the target range.
            const currentSelectionRange = event.selections.at(-1)
            if (!currentSelectionRange?.intersection(this.activeRequest.codeToReplaceData.range)) {
                this.rejectActiveEdit(autoeditRejectReason.onDidChangeTextEditorSelection)
            }
        }
    }
}
