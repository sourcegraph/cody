import type * as vscode from 'vscode'

import { isFileURI } from '@sourcegraph/cody-shared'

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
            args.decorationInfo
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

    // TODO: Revist this as now the inline manager also renders decorations
    protected async onDidChangeTextEditorSelection(
        event: vscode.TextEditorSelectionChangeEvent
    ): Promise<void> {
        // If the cursor moved in any file, we assume it's a user action and
        // dismiss the active edit. This is because parts of the edit might be
        // rendered as inline completion ghost text, which is hidden by default
        // whenever the cursor moves.
        if (isFileURI(event.textEditor.document.uri)) {
            this.rejectActiveEdit()
        }
    }
}
