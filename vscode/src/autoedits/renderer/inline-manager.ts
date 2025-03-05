import type * as vscode from 'vscode'

import { isFileURI } from '@sourcegraph/cody-shared'

import { AutoeditClientCapabilities } from '../autoedits-provider'
import { areSameUriDocs } from '../utils'
import { generateSuggestionAsImage } from './image-gen'
import { makeVisualDiff } from './image-gen/visual-diff'
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

        if (this.shouldRenderTextDecorations(args.decorationInfo, capabilities)) {
            return {
                type: 'decorations',
                decorations: {
                    ...this.getInlineDecorations(args.decorationInfo),
                    // No need to show insertion marker when only using inline decorations
                    insertMarkerDecorations: [],
                },
            }
        }

        const diffMode = this.getImageDiffMode(capabilities)
        const { diff, position } = makeVisualDiff(args.decorationInfo, diffMode, args.document)
        const image = generateSuggestionAsImage({
            diff,
            lang: args.document.languageId,
            mode: diffMode,
        })

        // We have determined that the diff requires rendering as an image for the optimal user experience.
        // Additions are entirely represented with the image, and deletions are shown as decorations.
        const { deletionDecorations } = this.getInlineDecorations(args.decorationInfo)
        const { insertionDecorations, insertMarkerDecorations } = this.createModifiedImageDecorations(
            image,
            position,
            args.document
        )
        return {
            type: 'image',
            decorations: {
                insertionDecorations,
                insertMarkerDecorations,
                deletionDecorations,
            },
            imageData: {
                ...image,
                position,
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
