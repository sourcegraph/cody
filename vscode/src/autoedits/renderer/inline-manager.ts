import type * as vscode from 'vscode'

import { isFileURI } from '@sourcegraph/cody-shared'

import type { AutoeditClientCapabilities } from '../autoedits-provider'
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
    public getRenderOutput(
        args: GetRenderOutputArgs,
        capabilities: AutoeditClientCapabilities
    ): AutoEditRenderOutput {
        const completionsWithDecorations = this.getCompletionsWithPossibleDecorationsRenderOutput(
            args,
            capabilities
        )
        if (completionsWithDecorations) {
            return completionsWithDecorations
        }

        const inlineDiff = this.getInlineRenderOutput(args, capabilities)
        if (inlineDiff) {
            return inlineDiff
        }

        const asideDiff = this.getAsideRenderOutput(args, capabilities)
        if (asideDiff) {
            return asideDiff
        }

        // This should only happen if a client has opted in to `autoedit` but not provided a valid
        // `autoeditInlineDiff` or `autoeditAsideDiff` capability.
        throw new Error(
            'Unable to get a render suitable suggestion for autoedit. Please ensure the correct clientCapabilities are set for this client.'
        )
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

    protected async onDidChangeTextEditorSelection(
        event: vscode.TextEditorSelectionChangeEvent
    ): Promise<void> {
        if (this.hasInlineCompletionItems() && isFileURI(event.textEditor.document.uri)) {
            // We are showing a completion, possibly alongisde decorations. The dismissal of the completion will
            // automatically be handled by VS Code. We must match that behaviour for the decorations,
            // otherwise we will end up with a scenario where the decorations of a suggestion are preserved,
            // whilst the completion has already been dismissed.
            // If the cursor moved in any file, we assume it's a user action and
            // dismiss the active edit.
            this.rejectActiveEdit()
        }

        if (
            this.hasInlineDecorationOnly() &&
            this.activeRequest &&
            areSameUriDocs(event.textEditor.document, this.activeRequest?.document)
        ) {
            // We are only showing decorations. We can handle this entirely ourselves.
            // We will only dismiss the suggestion if the user moves the cursor outside of the target range.
            const currentSelectionRange = event.selections.at(-1)
            if (!currentSelectionRange?.intersection(this.activeRequest.codeToReplaceData.range)) {
                this.rejectActiveEdit()
            }
        }
    }
}
