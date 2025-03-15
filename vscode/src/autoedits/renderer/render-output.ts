import type { CodeToReplaceData, DocumentContext } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { completionMatchesSuffix } from '../../completions/is-completion-visible'
import { shortenPromptForOutputChannel } from '../../completions/output-channel-logger'
import { isRunningInsideAgent } from '../../jsonrpc/isRunningInsideAgent'
import type { AutoeditRequestID } from '../analytics-logger'
import { AutoeditCompletionItem } from '../autoedit-completion-item'
import type { AutoeditClientCapabilities } from '../autoedits-provider'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { AutoEditDecoration, AutoEditDecorations, DecorationInfo } from './decorators/base'
import { cssPropertiesToString } from './decorators/utils'
import { isOnlyAddingTextForModifiedLines, isOnlyRemovingTextForModifiedLines } from './diff-utils'
import { type GeneratedImageSuggestion, generateSuggestionAsImage } from './image-gen'
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
    inlineCompletionItems: AutoeditCompletionItem[]
    updatedDecorationInfo: null
    updatedPrediction: string
}

export interface CompletionRenderOutput {
    type: 'completion'
    inlineCompletionItems: AutoeditCompletionItem[]
    updatedDecorationInfo: null
    updatedPrediction: string
}

interface CompletionWithDecorationsRenderOutput {
    type: 'completion-with-decorations'
    inlineCompletionItems: AutoeditCompletionItem[]
    decorations: AutoEditDecorations
    updatedDecorationInfo: DecorationInfo
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
        position: { line: number; column: number }
    } & GeneratedImageSuggestion
}

/**
 * This is an escape hatch to support clients that do not support images when rendering the diff to the side.
 * This is used when the client has `autoeditAsideDiff` set to `diff`.
 */
interface CustomRenderOutput {
    type: 'custom'
}

export type AutoEditRenderOutput =
    | NoCompletionRenderOutput
    | LegacyCompletionRenderOutput
    | CompletionRenderOutput
    | CompletionWithDecorationsRenderOutput
    | LegacyDecorationsRenderOutput
    | DecorationsRenderOutput
    | ImageRenderOutput
    | CustomRenderOutput

/**
 * Manages the rendering of an auto-edit suggestion in the editor.
 * This can either be:
 * 1. As a completion (adding text only)
 * 2. As a mix of completion and decorations (adding/removing text in a simple diff)
 * 3. As decorations (adding/removing text in a simple diff where completions are not possible or desirable)
 * 4. As an image (adding/removing text in a complex diff where decorations are not desirable)
 */
export class AutoEditsRenderOutput {
    protected getInlineRenderOutput(
        args: GetRenderOutputArgs,
        capabilities: AutoeditClientCapabilities
    ): AutoEditRenderOutput | null {
        if (!capabilities.autoeditInlineDiff || capabilities.autoeditInlineDiff === 'none') {
            // Inline diff rendering is disabled or not supported
            return null
        }

        const canRenderAside =
            capabilities.autoeditAsideDiff && capabilities.autoeditAsideDiff !== 'none'
        const shouldRenderInline = this.shouldRenderInlineDiff(args.decorationInfo, capabilities)

        if (!shouldRenderInline && canRenderAside) {
            // We have determined this diff is not suitable to render inline, and we know we can render aside.
            return null
        }

        return {
            type: 'decorations',
            decorations: {
                ...this.getInlineDecorations(args.decorationInfo),
                // No need to show insertion marker when only using inline decorations
                insertMarkerDecorations: [],
            },
        }
    }

    protected getAsideRenderOutput(
        args: GetRenderOutputArgs,
        capabilities: AutoeditClientCapabilities
    ): AutoEditRenderOutput | null {
        if (!capabilities.autoeditAsideDiff || capabilities.autoeditAsideDiff === 'none') {
            // Aside diff rendering is disabled or not supported
            return null
        }

        if (capabilities.autoeditAsideDiff === 'diff') {
            return { type: 'custom' }
        }

        const diffMode =
            capabilities.autoeditInlineDiff === 'deletions-only' ||
            capabilities.autoeditInlineDiff === 'insertions-and-deletions'
                ? 'additions'
                : 'unified'
        const { diff, position } = makeVisualDiff(args.decorationInfo, diffMode, args.document)
        const image = generateSuggestionAsImage({
            diff,
            lang: args.document.languageId,
            mode: diffMode,
        })
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
                deletionDecorations,
                insertMarkerDecorations,
            },
            imageData: {
                ...image,
                position,
            },
        }
    }

    protected getCompletionsWithPossibleDecorationsRenderOutput(
        args: GetRenderOutputArgs,
        capabilities: AutoeditClientCapabilities
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
            this.shouldRenderInlineDiff(completions.updatedDecorationInfo, capabilities)

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
        inlineCompletionItems: AutoeditCompletionItem[]
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
            new AutoeditCompletionItem({
                id: requestId,
                insertText: completionText,
                range: new vscode.Range(
                    document.lineAt(position).range.start,
                    document.lineAt(position).range.end
                ),
                command: {
                    title: 'Autoedit accepted',
                    command: 'cody.supersuggest.accept',
                    arguments: [
                        {
                            requestId,
                        },
                    ],
                },
            }),
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

    protected shouldRenderInlineDiff(
        decorationInfo: DecorationInfo,
        clientCapabilities: AutoeditClientCapabilities
    ): boolean {
        if (decorationInfo.addedLines.length > 0) {
            // It is difficult to show added lines with decorations, as we cannot inject new lines.
            return false
        }

        const hasDeletions =
            decorationInfo.removedLines.length > 0 ||
            !isOnlyAddingTextForModifiedLines(decorationInfo.modifiedLines)
        if (clientCapabilities.autoeditInlineDiff === 'insertions-only' && hasDeletions) {
            // We have deletions to show, but the client only supports insertions with text decorations.
            // We should render an image instead.
            return false
        }

        const hasInsertions =
            decorationInfo.addedLines.length > 0 ||
            !isOnlyRemovingTextForModifiedLines(decorationInfo.modifiedLines)
        if (clientCapabilities.autoeditInlineDiff === 'deletions-only' && hasInsertions) {
            // We have insertions to show, but the client only supports deletions with text decorations.
            // We should render an image instead.
            return false
        }

        // Removed lines are simple to show with decorations, so we only now care about the modified lines.
        // We should only render decorations if the remaining diff is simple.
        const includesComplexModifiedLines = this.hasComplexModifiedLines(decorationInfo.modifiedLines)
        return !includesComplexModifiedLines
    }

    private hasComplexModifiedLines(modifiedLines: DecorationInfo['modifiedLines']): boolean {
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

    private getInlineDecorations(
        decorationInfo: DecorationInfo
    ): Omit<AutoEditDecorations, 'insertMarkerDecorations'> {
        const fullLineDeletionDecorations = decorationInfo.removedLines.map(
            ({ originalLineNumber, text }) => {
                const range = new vscode.Range(originalLineNumber, 0, originalLineNumber, text.length)
                return this.createRemovedDecoration(range, text)
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
                    text: '',
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
                    text: '',
                    range: new vscode.Range(position.line, 0, position.line, startLineEndColumn),
                },
            ],
        }
    }

    private createModifiedAdditionDecorations(
        decorationInfo: DecorationInfo
    ): Omit<AutoEditDecorations, 'deletionDecorations' | 'insertMarkerDecorations'> {
        const { modifiedLines } = decorationInfo
        const decorations: AutoEditDecoration[] = []

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

    private createModifiedRemovedDecorations(decorationInfo: DecorationInfo): AutoEditDecoration[] {
        const { modifiedLines } = decorationInfo
        const decorations: AutoEditDecoration[] = []

        for (const line of modifiedLines) {
            for (const change of line.changes) {
                if (change.type === 'delete') {
                    decorations.push(this.createRemovedDecoration(change.originalRange, change.text))
                }
            }
        }

        return decorations
    }

    /**
     * Create a ghost text decoration at the given position.
     */
    private createGhostTextDecoration(position: vscode.Position, text: string): AutoEditDecoration {
        return {
            text,
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
    private createRemovedDecoration(range: vscode.Range, text: string): AutoEditDecoration {
        return {
            text,
            range,
            renderOptions: {
                before: {
                    contentText: '\u00A0'.repeat(text.length),
                    backgroundColor: 'rgba(255,0,0,0.3)', // red background for deletions
                    margin: `0 -${text.length}ch 0 0`,
                },
            },
        }
    }
}
