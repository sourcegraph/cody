import type { DocumentContext } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { completionMatchesSuffix } from '../../completions/is-completion-visible'
import { shortenPromptForOutputChannel } from '../../completions/output-channel-logger'
import type { AutoeditRequestID } from '../analytics-logger'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { AutoEditDecorations, DecorationInfo } from './decorators/base'
import { cssPropertiesToString } from './decorators/utils'
import { isOnlyAddingTextForModifiedLines, isOnlyRemovingTextForModifiedLines } from './diff-utils'
import { generateSuggestionAsImage } from './image-gen'
import { getEndColumnForLine } from './image-gen/utils'
import { makeVisualDiff } from './image-gen/visual-diff'
import { getCompletionText } from './render-output-utils'

export interface GetRenderOutputArgs {
    requestId: AutoeditRequestID
    document: vscode.TextDocument
    prediction: string
    position: vscode.Position
    docContext: DocumentContext
    decorationInfo: DecorationInfo
}

// TODO: Are these properties needed anymore?
interface BaseRenderOutput {
    updatedPrediction: string
    updatedDecorationInfo: DecorationInfo
}

export interface CompletionRenderOutput extends BaseRenderOutput {
    type: 'completion'
    completions: vscode.InlineCompletionItem[]
}

export interface CompletionWithDecorationsRenderOutput extends BaseRenderOutput {
    type: 'completion-with-decorations'
    completions: vscode.InlineCompletionItem[]
    decorations: AutoEditDecorations
}

export interface DecorationsRenderOutput extends BaseRenderOutput {
    type: 'decorations'
    decorations: AutoEditDecorations
}

export interface ImageRenderOutput extends BaseRenderOutput {
    type: 'image'
    decorations: AutoEditDecorations
}

export type AutoEditRenderOutput =
    | CompletionRenderOutput
    | CompletionWithDecorationsRenderOutput
    | DecorationsRenderOutput
    | ImageRenderOutput

/**
 * Manages the rendering of an auto-edit suggestion in the editor.
 * This can either be:
 * 1. As a completion (adding text only)
 * 2. As a mix of completion and decorations (adding and removing text in a simple diff)
 * 3. As an image (adding and removing text in a complex diff)
 */
export class AutoEditsRenderOutput {
    public getRenderOutput(args: GetRenderOutputArgs): AutoEditRenderOutput {
        console.log('goingg now')
        const completionsWithDecorations = this.getCompletionsWithPossibleDecorationsRenderOutput(args)
        if (completionsWithDecorations) {
            console.log('got compeltions and decorations')
            console.log(completionsWithDecorations)
            console.log('finished logged completions and decorations')
            // We can render this entirely with completions possibly with a small amount of decorations.
            return completionsWithDecorations
        }

        console.log('hmmm')

        if (this.shouldRenderImage(args.decorationInfo)) {
            console.log('rendering image')
            // We have determined that the diff requires rendering as an image for the optimal user experience.
            // Additions are entirely represented with the image, and deletions are shown as decorations.
            const { deletionDecorations } = this.getInlineDecorations(args.decorationInfo)
            const { insertionDecorations, insertMarkerDecorations } =
                this.createModifiedImageDecorations(args.document, args.decorationInfo)
            return {
                type: 'image',
                decorations: {
                    insertionDecorations,
                    insertMarkerDecorations,
                    deletionDecorations,
                },
                updatedDecorationInfo: args.decorationInfo,
                updatedPrediction: args.prediction,
            }
        }

        console.log('text decorations!')
        // We can render this diff with just text decorations
        return {
            type: 'decorations',
            decorations: {
                ...this.getInlineDecorations(args.decorationInfo),
                // No need to show insertion marker when only using inline decorations
                insertMarkerDecorations: [],
            },
            updatedDecorationInfo: args.decorationInfo,
            updatedPrediction: args.prediction,
        }
    }

    private getCompletionsWithPossibleDecorationsRenderOutput(
        args: GetRenderOutputArgs
    ): CompletionRenderOutput | CompletionWithDecorationsRenderOutput | null {
        const completions = this.tryMakeInlineCompletions(args)
        if (!completions) {
            // Cannot render a completion
            return null
        }

        if (completions.type === 'full') {
            // We can render the entire suggestion as a completion
            return {
                type: 'completion',
                completions: completions.inlineCompletionItems,
                updatedPrediction: completions.updatedPrediction,
                updatedDecorationInfo: completions.updatedDecorationInfo,
            }
        }

        if (!this.shouldRenderCompletionWithDecorations(completions.updatedDecorationInfo)) {
            // We can render a completion with decorations, but we have decided that it will be
            // too difficult to read.
            return null
        }

        return {
            type: 'completion-with-decorations',
            completions: completions.inlineCompletionItems,
            decorations: {
                ...this.getInlineDecorations(completions.updatedDecorationInfo),
                // No need to show insertion marker when only using inline decorations
                insertMarkerDecorations: [],
            },
            updatedPrediction: completions.updatedPrediction,
            updatedDecorationInfo: completions.updatedDecorationInfo,
        }
    }

    public tryMakeInlineCompletions({
        requestId,
        position,
        docContext,
        prediction,
        document,
        decorationInfo,
    }: GetRenderOutputArgs): {
        type: 'full' | 'partial'
        inlineCompletionItems: vscode.InlineCompletionItem[]
        updatedDecorationInfo: DecorationInfo
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

    private shouldRenderImage(decorationInfo: DecorationInfo): boolean {
        if (decorationInfo.addedLines.length > 0) {
            // Any additions should be represented with the image
            return true
        }

        if (isOnlyAddingTextForModifiedLines(decorationInfo.modifiedLines)) {
            // We only have modified lines to show but they are just insertions.
            // We can render them as text.
            return false
        }

        let linesWithChanges = 0
        for (const modifiedLine of decorationInfo.modifiedLines) {
            const changeCount = modifiedLine.changes.filter(
                change => change.type === 'delete' || change.type === 'insert'
            ).length

            if (changeCount === 0) {
                continue
            }

            if (changeCount >= 3) {
                // Three or more changes on a single line is classified as complex
                // An image is best to represent this.
                return true
            }

            linesWithChanges++
            if (linesWithChanges >= 3) {
                // Three or more lines with changes is classified as complex
                // An image is best to represent this.
                return true
            }
        }

        return false
    }

    /**
     * If the entire suggestion can only be partially rendered with a completion, we support
     * mixing this completion with decorations.
     * We only do this for a simple diff as otherwise the diff can quickly become difficult to read.
     */
    private shouldRenderCompletionWithDecorations(remainingDecorationInfo: DecorationInfo): boolean {
        // This is a simple heuristic to decide if we should mix completions and decorations.
        // Essentially, we will only render like this if the completion is entirely for the inserted text
        // and the decorations are entirely for the removed changes.
        return isOnlyRemovingTextForModifiedLines(remainingDecorationInfo.modifiedLines)
    }

    private getInlineDecorations(
        decorationInfo: DecorationInfo
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

    private createModifiedImageDecorations(
        document: vscode.TextDocument,
        decorationInfo: DecorationInfo
    ): Omit<AutoEditDecorations, 'deletionDecorations'> {
        // TODO: Diff mode will likely change depending on the environment.
        // This should be determined by client capabilities.
        // VS Code: 'additions'
        // Client capabiliies === image: 'unified'
        const diffMode = 'additions'
        const { diff, target } = makeVisualDiff(decorationInfo, diffMode, document)
        const { dark, light, pixelRatio } = generateSuggestionAsImage({
            diff,
            lang: document.languageId,
            mode: diffMode,
        })
        const startLineEndColumn = getEndColumnForLine(document.lineAt(target.line), document)

        // The padding in which to offset the decoration image away from neighbouring code
        const decorationPadding = 4
        // The margin position where the decoration image should render.
        // Ensuring it does not conflict with the visibility of existing code.
        const decorationMargin = target.offset - startLineEndColumn + decorationPadding
        const decorationStyle = cssPropertiesToString({
            // Absolutely position the suggested code so that the cursor does not jump there
            position: 'absolute',
            // Make sure the decoration is rendered on top of other decorations
            'z-index': '9999',
            // Scale the decoration to the correct size (upscaled to boost resolution)
            scale: String(1 / pixelRatio),
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
                        target.line,
                        startLineEndColumn,
                        target.line,
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
                        dark: { before: { contentIconPath: vscode.Uri.parse(dark) } },
                        light: { before: { contentIconPath: vscode.Uri.parse(light) } },
                    },
                },
            ],
            insertMarkerDecorations: [
                {
                    range: new vscode.Range(target.line, 0, target.line, startLineEndColumn),
                },
            ],
        }
    }

    private createModifiedAdditionDecorations(
        decorationInfo: DecorationInfo
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

    private createModifiedRemovedDecorations(
        decorationInfo: DecorationInfo
    ): vscode.DecorationOptions[] {
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
