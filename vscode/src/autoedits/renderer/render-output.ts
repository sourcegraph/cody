import type { ClientCapabilities, CodeToReplaceData, DocumentContext } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { completionMatchesSuffix } from '../../completions/is-completion-visible'
import { shortenPromptForOutputChannel } from '../../completions/output-channel-logger'
import { isRunningInsideAgent } from '../../jsonrpc/isRunningInsideAgent'
import type { AutoeditRequestID } from '../analytics-logger'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { AutoEditDecorations, AutoeditDiff } from './decorators/base'
import { cssPropertiesToString } from './decorators/utils'
import { isOnlyAddingTextForModifiedLines, isOnlyRemovingTextForModifiedLines } from './diff-utils'
import type { GeneratedImageSuggestion } from './image-gen'
import { getEndColumnForLine } from './image-gen/utils'
import type { DiffMode } from './image-gen/visual-diff/types'
import { getCompletionText } from './render-output-utils'

export interface GetRenderOutputArgs {
    requestId: AutoeditRequestID
    document: vscode.TextDocument
    prediction: string
    position: vscode.Position
    docContext: DocumentContext
    decorationInfo: AutoeditDiff
    codeToReplaceData: CodeToReplaceData
}

interface NoCompletionRenderOutput {
    // Used when it is not deemed possible to render anything.
    type: 'none'
}

/**
 * Legacy completion output that is required for the deprecated default decoator.
 * See vscode/src/autoedits/renderer/decorators/default-decorator.ts
 */
export interface LegacyCompletionRenderOutput {
    type: 'legacy-completion'
    inlineCompletionItems: vscode.InlineCompletionItem[]
    updatedDecorationInfo: null
    updatedPrediction: string
}

export interface CompletionRenderOutput {
    type: 'completion'
    inlineCompletionItems: vscode.InlineCompletionItem[]
    updatedDecorationInfo: null
    updatedPrediction: string
}

interface CompletionWithDecorationsRenderOutput {
    type: 'completion-with-decorations'
    inlineCompletionItems: vscode.InlineCompletionItem[]
    decorations: AutoEditDecorations
    updatedDecorationInfo: AutoeditDiff
    updatedPrediction: string
}

/**
 * Legacy decorations output that is required for the deprecated default decoator.
 * See vscode/src/autoedits/renderer/decorators/default-decorator.ts.
 */
export interface LegacyDecorationsRenderOutput {
    // Only the type, the logic to compute the decorations lives in the default decorator
    // instead of `getRenderOutput`.
    type: 'legacy-decorations'
}

interface DecorationsRenderOutput {
    type: 'decorations'
    decorations: AutoEditDecorations
}

interface ImageRenderOutput {
    type: 'image'
    decorations: AutoEditDecorations
    /**
     * The image data to render.
     * This is used for clients that do not have builtin support for decorations like VS Code.
     * We will provide this image data directly so the client can still show the suggestion.
     */
    imageData: {
        image: GeneratedImageSuggestion
        position: { line: number; column: number }
    }
}

export type AutoEditRenderOutput =
    | NoCompletionRenderOutput
    | LegacyCompletionRenderOutput
    | CompletionRenderOutput
    | CompletionWithDecorationsRenderOutput
    | LegacyDecorationsRenderOutput
    | DecorationsRenderOutput
    | ImageRenderOutput

/**
 * Manages the rendering of an auto-edit suggestion in the editor.
 * This can either be:
 * 1. As a completion (adding text only)
 * 2. As a mix of completion and decorations (adding/removing text in a simple diff)
 * 3. As decorations (adding/removing text in a simple diff where completions are not possible or desirable)
 * 4. As an image (adding/removing text in a complex diff where decorations are not desirable)
 */
export class AutoEditsRenderOutput {
    protected getCompletionsWithPossibleDecorationsRenderOutput(
        args: GetRenderOutputArgs,
        clientCapabilities: ClientCapabilities
    ): CompletionRenderOutput | CompletionWithDecorationsRenderOutput | null {
        const completions = this.tryMakeInlineCompletions(args)
        if (!completions) {
            // Cannot render a completion
            return null
        }

        if (completions.type === 'full') {
            // We can render the entire suggestion as a completion.
            return {
                type: 'completion',
                inlineCompletionItems: completions.inlineCompletionItems,
                updatedPrediction: completions.updatedPrediction,
                updatedDecorationInfo: null,
            }
        }

        if (isRunningInsideAgent()) {
            // We do not support mixing completions and decorations in other clients right now.
            return null
        }

        // We have a partial completion, so we _can_ technically render this by including decorations.
        // We should only do this if we determine that the diff is simple enough to be readable.
        // This follows the same logic that we use to determine if we are rendering an image or decorations,
        // except we also unsure that we only have removed text for modified lines. This is because it can can create
        // a confusing UX when rendering a mix of completion insertion text and decoration insertion text.
        const renderWithDecorations =
            isOnlyRemovingTextForModifiedLines(completions.updatedDecorationInfo.modifiedLines) &&
            this.shouldRenderDecorations(completions.updatedDecorationInfo, clientCapabilities)

        if (renderWithDecorations) {
            return {
                type: 'completion-with-decorations',
                inlineCompletionItems: completions.inlineCompletionItems,
                decorations: {
                    ...this.getInlineDecorations(completions.updatedDecorationInfo),
                    // No need to show insertion marker when only using inline decorations
                    insertMarkerDecorations: [],
                },
                updatedPrediction: completions.updatedPrediction,
                updatedDecorationInfo: completions.updatedDecorationInfo,
            }
        }

        return null
    }

    private tryMakeInlineCompletions({
        requestId,
        position,
        docContext,
        prediction,
        document,
        decorationInfo,
    }: GetRenderOutputArgs): {
        type: 'full' | 'partial'
        inlineCompletionItems: vscode.InlineCompletionItem[]
        updatedDecorationInfo: AutoeditDiff
        updatedPrediction: string
    } | null {
        const { insertText, usedChangeIds } = getCompletionText({
            prediction,
            cursorPosition: position,
            decorationInfo,
        })

        if (insertText.length === 0) {
            return null
        }

        // The current line suffix should not require any char removals to render the completion.
        const isSuffixMatch = completionMatchesSuffix(insertText, docContext.currentLineSuffix)
        if (!isSuffixMatch) {
            // Does not match suffix. Cannot render inline completion.
            return null
        }

        const completionText = docContext.currentLinePrefix + insertText
        const inlineCompletionItems = [
            new vscode.InlineCompletionItem(
                completionText,
                new vscode.Range(
                    document.lineAt(position).range.start,
                    document.lineAt(position).range.end
                ),
                {
                    title: 'Autoedit accepted',
                    command: 'cody.supersuggest.accept',
                    arguments: [
                        {
                            requestId,
                        },
                    ],
                }
            ),
        ]

        autoeditsOutputChannelLogger.logDebugIfVerbose(
            'tryMakeInlineCompletions',
            'Autocomplete Inline Response: ',
            { verbose: shortenPromptForOutputChannel(completionText, []) }
        )

        function withoutUsedChanges<T extends { id: string }>(array: T[]): T[] {
            return array.filter(item => !usedChangeIds.has(item.id))
        }

        // Filter out changes that were used to render the inline completion.
        const decorationInfoWithoutUsedChanges = {
            addedLines: withoutUsedChanges(decorationInfo.addedLines),
            removedLines: withoutUsedChanges(decorationInfo.removedLines),
            modifiedLines: withoutUsedChanges(decorationInfo.modifiedLines).map(c => ({
                ...c,
                changes: withoutUsedChanges(c.changes),
            })),
            unchangedLines: withoutUsedChanges(decorationInfo.unchangedLines),
        }

        const remainingChanges =
            decorationInfoWithoutUsedChanges.addedLines.length +
            decorationInfoWithoutUsedChanges.removedLines.length +
            decorationInfoWithoutUsedChanges.modifiedLines.filter(line =>
                line.changes.some(change => change.type !== 'unchanged')
            ).length

        return {
            type: remainingChanges === 0 ? 'full' : 'partial',
            inlineCompletionItems,
            updatedPrediction: prediction,
            updatedDecorationInfo: decorationInfoWithoutUsedChanges,
        }
    }

    protected canRenderDecorations(
        decorationCapabilities: ClientCapabilities['autoEditDecorationSuggestions']
    ): boolean {
        const inAgent = isRunningInsideAgent()
        if (!inAgent) {
            // VS Code can render decorations
            return true
        }

        if (decorationCapabilities && decorationCapabilities === 'none') {
            // Client has explicitly disabled decorations
            return false
        }

        return true
    }

    protected canRenderImages(
        imageCapabilities: ClientCapabilities['autoEditImageSuggestions']
    ): boolean {
        const inAgent = isRunningInsideAgent()
        if (!inAgent) {
            // VS Code can render images
            return true
        }

        if (imageCapabilities && imageCapabilities === 'none') {
            // Client has explicitly disabled images
            return false
        }

        return true
    }

    protected getImageDiffMode(clientCapabilities: ClientCapabilities): DiffMode {
        const { autoEditDecorationSuggestions } = clientCapabilities
        const inAgent = isRunningInsideAgent()
        if (!inAgent) {
            // VS Code can render deletions as decorations, so we only want to show additions in the image
            return 'additions'
        }

        if (!autoEditDecorationSuggestions || autoEditDecorationSuggestions === 'none') {
            // We cannot render deletions as decorations. We must show the entire unified diff in the image.
            // No capabilities provided, default to unified diff
            return 'unified'
        }

        return 'additions'
    }

    protected shouldRenderDecorations(
        decorationInfo: AutoeditDiff,
        clientCapabilities: ClientCapabilities
    ): boolean {
        const canRenderDecorations = this.canRenderDecorations(
            clientCapabilities.autoEditDecorationSuggestions
        )
        if (!canRenderDecorations) {
            return false
        }

        const canRenderImages = this.canRenderImages(clientCapabilities.autoEditImageSuggestions)
        if (!canRenderImages) {
            // If we cannot render images, we should always render decorations
            // TODO: We need to differentiate between insertions and deletions here.
            return true
        }

        if (decorationInfo.addedLines.length > 0) {
            // It is difficult to show added lines with decorations, as we cannot inject new lines.
            return false
        }

        // Removed lines are simple to show with decorations, so we only now care about the modified lines.
        // We should only render decorations if the remaining diff is simple.
        const includesComplexModifiedLines = this.hasComplexModifiedLines(decorationInfo.modifiedLines)
        return !includesComplexModifiedLines
    }

    private hasComplexModifiedLines(modifiedLines: AutoeditDiff['modifiedLines']): boolean {
        if (
            isOnlyAddingTextForModifiedLines(modifiedLines) ||
            isOnlyRemovingTextForModifiedLines(modifiedLines)
        ) {
            // Pure deletions or pure insertions.
            // Classify as simple
            return false
        }

        let linesWithChanges = 0
        for (const modifiedLine of modifiedLines) {
            let alternatingChanges = 0
            for (let i = 0; i < modifiedLine.changes.length; i++) {
                const change = modifiedLine.changes[i]
                const nextChange = modifiedLine.changes[i + 1]
                if (
                    nextChange &&
                    nextChange.type !== 'unchanged' &&
                    change.type !== 'unchanged' &&
                    change.type !== nextChange.type
                ) {
                    // Two consecutive changes of different types.
                    alternatingChanges++
                }
            }

            if (alternatingChanges > 2) {
                // Three or more alternating changes on this line.
                // Classify as complex
                return true
            }

            const changes = modifiedLine.changes.filter(
                change => change.type === 'delete' || change.type === 'insert'
            )
            const changeCount = changes.length
            if (changeCount === 0) {
                continue
            }

            linesWithChanges++
            if (linesWithChanges > 3) {
                // Four or more modified lines in this diff.
                // Classify as complex
                return true
            }
        }

        return false
    }

    protected getInlineDecorations(
        decorationInfo: AutoeditDiff
    ): Omit<AutoEditDecorations, 'insertMarkerDecorations'> {
        const fullLineDeletionDecorations = decorationInfo.removedLines.map(
            ({ originalLineNumber, text }) => {
                const range = new vscode.Range(originalLineNumber, 0, originalLineNumber, text.length)
                return this.createRemovedDecoration(range, text.length)
            }
        )
        const partialLineDeletionDecorations = this.createModifiedRemovedDecorations(decorationInfo)
        const { insertionDecorations } = this.createModifiedAdditionDecorations(decorationInfo)
        return {
            insertionDecorations,
            deletionDecorations: [...fullLineDeletionDecorations, ...partialLineDeletionDecorations],
        }
    }

    protected createModifiedImageDecorations(
        image: GeneratedImageSuggestion,
        position: { line: number; column: number },
        document: vscode.TextDocument
    ): Omit<AutoEditDecorations, 'deletionDecorations'> {
        const startLineEndColumn = getEndColumnForLine(document.lineAt(position.line), document)
        // The padding in which to offset the decoration image away from neighbouring code
        const decorationPadding = 4
        // The margin position where the decoration image should render.
        // Ensuring it does not conflict with the visibility of existing code.
        const decorationMargin = position.column - startLineEndColumn + decorationPadding

        const decorationStyle = cssPropertiesToString({
            // Absolutely position the suggested code so that the cursor does not jump there
            position: 'absolute',
            // Make sure the decoration is rendered on top of other decorations
            'z-index': '9999',
            // Scale the decoration to the correct size (upscaled to boost resolution)
            scale: String(1 / image.pixelRatio),
            'transform-origin': '0px 0px',
            height: 'auto',
            // The decoration will be entirely taken up by the image.
            // Setting the line-height to 0 ensures that there is no additional padding added by the decoration area.
            'line-height': '0',
        })

        return {
            insertionDecorations: [
                {
                    range: new vscode.Range(
                        position.line,
                        startLineEndColumn,
                        position.line,
                        startLineEndColumn
                    ),
                    renderOptions: {
                        before: {
                            color: new vscode.ThemeColor('editorSuggestWidget.foreground'),
                            backgroundColor: new vscode.ThemeColor('editorSuggestWidget.background'),
                            border: '1px solid',
                            borderColor: new vscode.ThemeColor('editorSuggestWidget.border'),
                            textDecoration: `none;${decorationStyle}`,
                            margin: `0 0 0 ${decorationMargin}ch`,
                        },
                        after: {
                            contentText: '\u00A0'.repeat(3) + '\u00A0'.repeat(startLineEndColumn),
                            margin: `0 0 0 ${decorationMargin}ch`,
                        },
                        // Provide different highlighting for dark/light themes
                        dark: { before: { contentIconPath: vscode.Uri.parse(image.dark) } },
                        light: { before: { contentIconPath: vscode.Uri.parse(image.light) } },
                    },
                },
            ],
            insertMarkerDecorations: [
                {
                    range: new vscode.Range(position.line, 0, position.line, startLineEndColumn),
                },
            ],
        }
    }

    private createModifiedAdditionDecorations(
        decorationInfo: AutoeditDiff
    ): Omit<AutoEditDecorations, 'deletionDecorations' | 'insertMarkerDecorations'> {
        const { modifiedLines } = decorationInfo
        const decorations: vscode.DecorationOptions[] = []

        for (const line of modifiedLines) {
            // TODO(valery): verify that we still need to merge consecutive insertions.
            let currentInsertPosition: vscode.Position | null = null
            let currentInsertText = ''

            for (const change of line.changes) {
                if (change.type === 'insert') {
                    const position = change.originalRange.end
                    if (currentInsertPosition && position.isEqual(currentInsertPosition)) {
                        // Same position as previous, accumulate the text
                        currentInsertText += change.text
                    } else {
                        // Different position or first insertion, push previous insert group if any
                        if (currentInsertPosition) {
                            decorations.push(
                                this.createGhostTextDecoration(currentInsertPosition, currentInsertText)
                            )
                        }
                        // Start a new insert group
                        currentInsertPosition = position
                        currentInsertText = change.text
                    }
                } else {
                    // Handle the end of an insert group
                    if (currentInsertPosition) {
                        decorations.push(
                            this.createGhostTextDecoration(currentInsertPosition, currentInsertText)
                        )
                        currentInsertPosition = null
                        currentInsertText = ''
                    }
                }
            }

            // After processing all changes in the line, ensure the last insert group is added
            if (currentInsertPosition) {
                decorations.push(
                    this.createGhostTextDecoration(currentInsertPosition, currentInsertText)
                )
                currentInsertPosition = null
                currentInsertText = ''
            }
        }

        return { insertionDecorations: decorations }
    }

    private createModifiedRemovedDecorations(decorationInfo: AutoeditDiff): vscode.DecorationOptions[] {
        const { modifiedLines } = decorationInfo
        const decorations: vscode.DecorationOptions[] = []

        for (const line of modifiedLines) {
            for (const change of line.changes) {
                if (change.type === 'delete') {
                    decorations.push(
                        this.createRemovedDecoration(change.originalRange, change.text.length)
                    )
                }
            }
        }

        return decorations
    }

    /**
     * Create a ghost text decoration at the given position.
     */
    private createGhostTextDecoration(
        position: vscode.Position,
        text: string
    ): vscode.DecorationOptions {
        return {
            range: new vscode.Range(position, position),
            renderOptions: {
                before: {
                    color: 'rgba(128, 128, 128, 0.5)', // ghost text color
                    margin: '0 0 0 0',
                    fontStyle: 'italic',
                    contentText: text,
                },
            },
        }
    }

    /**
     * A helper to create a removed text decoration for a given range and text length.
     * Both entire line removals and inline deletions use this logic.
     */
    private createRemovedDecoration(range: vscode.Range, textLength: number): vscode.DecorationOptions {
        return {
            range,
            renderOptions: {
                before: {
                    contentText: '\u00A0'.repeat(textLength),
                    backgroundColor: 'rgba(255,0,0,0.3)', // red background for deletions
                    margin: `0 -${textLength}ch 0 0`,
                },
            },
        }
    }
}
