import * as vscode from 'vscode'

import { type DocumentContext, tokensToChars } from '@sourcegraph/cody-shared'

import {
    completionMatchesSuffix,
    getLatestVisibilityContext,
    isCompletionVisible,
} from '../../completions/is-completion-visible'
import {
    type AutoeditRequestID,
    autoeditAnalyticsLogger,
    autoeditDiscardReason,
} from '../analytics-logger'
import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { CodeToReplaceData } from '../prompt/prompt-utils'
import {
    adjustPredictionIfInlineCompletionPossible,
    areSameUriDocs,
    extractInlineCompletionFromRewrittenCode,
} from '../utils'

import { shortenPromptForOutputChannel } from '../../completions/output-channel-logger'
import type { FixupController } from '../../non-stop/FixupController'
import { CodyTaskState } from '../../non-stop/state'
import type { AutoEditInlineDecorations, AutoEditsDecorator, DecorationInfo } from './decorators/base'
import { cssPropertiesToString } from './decorators/utils'
import { generateSuggestionAsImage } from './image-gen'
import { getEndColumnForLine } from './image-gen/utils'
import { getCompletionText } from './inline-manager'
import { makeVisualDiff } from './visual-diff'
import type { DiffMode, VisualDiff } from './visual-diff/types'

export interface TryMakeInlineCompletionsArgs {
    requestId: AutoeditRequestID
    prediction: string
    codeToReplaceData: CodeToReplaceData
    document: vscode.TextDocument
    position: vscode.Position
    docContext: DocumentContext
    decorationInfo: DecorationInfo
}

export interface GetRenderOutputArgs {
    requestId: AutoeditRequestID
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

    /**
     * Produces the optimal render output for the given prediction data.
     */
    getRenderOutput(args: GetRenderOutputArgs): {
        /**
         * `null` if no inline completion items should be rendered
         */
        inlineCompletionItems: vscode.InlineCompletionItem[] | null
        /**
         * `null` if no inline decorations should be rendered
         */
        inlineDecorationItems: AutoEditInlineDecorations[] | null
        updatedPrediction: string
        updatedDecorationInfo: DecorationInfo
    }

    handleDidShowSuggestion(requestId: AutoeditRequestID): Promise<void>

    /**
     * Renders the prediction as inline decorations.
     */
    renderInlineDecorations(decorationInfo: DecorationInfo): Promise<void>

    renderInlineDecorationsV2(decorations: AutoEditInlineDecorations[]): Promise<void>

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

    private readonly addedTextDecorationType = vscode.window.createTextEditorDecorationType({})
    private readonly removedTextDecorationType = vscode.window.createTextEditorDecorationType({})
    private readonly imageDecorationType = vscode.window.createTextEditorDecorationType({})

    constructor(
        protected createDecorator: (editor: vscode.TextEditor) => AutoEditsDecorator,
        protected fixupController: FixupController
    ) {
        this.disposables.push(
            vscode.commands.registerCommand('cody.supersuggest.accept', () => this.acceptActiveEdit()),
            vscode.commands.registerCommand('cody.supersuggest.dismiss', () => this.rejectActiveEdit()),
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
        if (
            // Only dismiss if there are inline decorations, as inline completion items rely on
            // a native acceptance/rejection mechanism that we can't interfere with.
            this.hasInlineDecorationOnly() &&
            // Only dismiss if we have an active suggestion and the changed document matches
            // else, we will falsely discard the suggestion on unrelated changes such as changes in output panel.
            areSameUriDocs(event.document, this.activeRequest?.document)
        ) {
            this.rejectActiveEdit()
        }
    }

    protected onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined): void {
        if (!editor || !areSameUriDocs(editor.document, this.activeRequest?.document)) {
            this.rejectActiveEdit()
        }
    }

    protected onDidCloseTextDocument(document: vscode.TextDocument): void {
        if (areSameUriDocs(document, this.activeRequest?.document)) {
            this.rejectActiveEdit()
        }
    }

    protected onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): void {
        if (
            // Only dismiss if there are inline decorations, as inline completion items rely on
            // a native acceptance/rejection mechanism that we can't interfere with.
            //
            // For instance, the acceptance command is triggered only after the document changes.
            // This means we can't depend on document or selection changes to handle cases where
            // inline completion items are accepted because they get rejected before the
            // acceptance callback is fired by VS Code.
            this.hasInlineDecorationOnly() &&
            this.activeRequest &&
            areSameUriDocs(event.textEditor.document, this.activeRequest?.document)
        ) {
            const currentSelectionRange = event.selections.at(-1)
            if (!currentSelectionRange?.intersection(this.activeRequest.codeToReplaceData.range)) {
                this.rejectActiveEdit()
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

    public hasInlineDecorationOnly(): boolean {
        return !this.activeRequest?.inlineCompletionItems
    }

    public async handleDidShowSuggestion(requestId: AutoeditRequestID): Promise<void> {
        await this.rejectActiveEdit()

        const request = autoeditAnalyticsLogger.getRequest(requestId)
        if (!request) {
            return
        }
        if (this.hasConflictingDecorations(request.document, request.codeToReplaceData.range)) {
            autoeditAnalyticsLogger.markAsDiscarded({
                requestId,
                discardReason: autoeditDiscardReason.conflictingDecorationWithEdits,
            })
            return
        }

        this.decorator = this.createDecorator(vscode.window.activeTextEditor!)
        if (
            'decorationInfo' in request &&
            request.decorationInfo &&
            !this.decorator.canRenderDecoration(request.decorationInfo)
        ) {
            // If the decorator cannot render the decoration properly, dispose of it and return early.
            this.decorator.dispose()
            this.decorator = null
            autoeditAnalyticsLogger.markAsDiscarded({
                requestId,
                discardReason: autoeditDiscardReason.notEnoughLinesEditor,
            })
            return
        }

        this.activeRequestId = requestId
        autoeditAnalyticsLogger.markAsSuggested(requestId)

        // Clear any existing timeouts, only one suggestion can be shown at a time
        clearTimeout(this.autoeditSuggestedTimeoutId)

        // Mark suggestion as read after a delay if it's still visible.
        this.autoeditSuggestedTimeoutId = setTimeout(() => {
            if (this.activeRequest?.requestId === requestId) {
                const {
                    document: invokedDocument,
                    position: invokedPosition,
                    docContext,
                    inlineCompletionItems,
                } = this.activeRequest

                const { activeTextEditor } = vscode.window

                if (!activeTextEditor || !areSameUriDocs(activeTextEditor.document, invokedDocument)) {
                    // User is no longer in the same document as the completion
                    return
                }

                // If a completion is rendered as an inline completion item we have to
                // manually check if the visibility context for the item is still valid and
                // it's still present in the document.
                //
                // If the invoked cursor position does not match the current cursor position
                // we check if the items insert text matches the current document context.
                // If a user continued typing as suggested the insert text is still present
                // and we can a completion as read.
                if (inlineCompletionItems?.[0]) {
                    const visibilityContext = getLatestVisibilityContext({
                        invokedPosition,
                        invokedDocument,
                        activeTextEditor,
                        docContext,
                        inlineCompletionContext: undefined,
                        maxPrefixLength: tokensToChars(autoeditsProviderConfig.tokenLimit.prefixTokens),
                        maxSuffixLength: tokensToChars(autoeditsProviderConfig.tokenLimit.suffixTokens),
                        // TODO: implement suggest widget support
                        shouldTakeSuggestWidgetSelectionIntoAccount: () => false,
                    })

                    const isStillVisible = isCompletionVisible(
                        inlineCompletionItems[0].insertText as string,
                        visibilityContext.document,
                        {
                            invokedPosition,
                            latestPosition: visibilityContext.position,
                        },
                        visibilityContext.docContext,
                        visibilityContext.inlineCompletionContext,
                        visibilityContext.takeSuggestWidgetSelectionIntoAccount,
                        undefined // abort signal
                    )

                    if (isStillVisible) {
                        autoeditAnalyticsLogger.markAsRead(requestId)
                    }
                } else {
                    // For suggestions rendered as inline decoration we can rely on our own dismissal
                    // logic (document change/selection change callback). So having a truthy `this.activeRequest`
                    // is enough to mark a suggestion as read.
                    autoeditAnalyticsLogger.markAsRead(requestId)
                }
            }
        }, AUTOEDIT_VISIBLE_DELAY_MS)
    }

    protected async handleDidHideSuggestion(decorator: AutoEditsDecorator | null): Promise<void> {
        if (decorator) {
            decorator.dispose()
            // Hide inline decorations
            await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', false)
        }

        // Hide inline completion provider item ghost text
        await vscode.commands.executeCommand('editor.action.inlineSuggest.hide')

        this.activeRequestId = null
        this.decorator = null
    }

    protected async acceptActiveEdit(): Promise<void> {
        const editor = vscode.window.activeTextEditor
        const { activeRequest, decorator } = this
        // Compute this variable before the `handleDidHideSuggestion` call which removes the active request.
        const hasInlineDecorationOnly = this.hasInlineDecorationOnly()

        if (
            !editor ||
            !activeRequest ||
            !areSameUriDocs(editor.document, this.activeRequest?.document)
        ) {
            return this.rejectActiveEdit()
        }

        await this.handleDidHideSuggestion(decorator)
        autoeditAnalyticsLogger.markAsAccepted(activeRequest.requestId)

        // We rely on the native VS Code functionality for accepting inline completions items.
        // There's no need to manually edit the document.
        if (hasInlineDecorationOnly) {
            await editor.edit(editBuilder => {
                editBuilder.replace(activeRequest.codeToReplaceData.range, activeRequest.prediction)
            })
        }
    }

    protected async rejectActiveEdit(): Promise<void> {
        const { activeRequest, decorator } = this

        if (decorator) {
            await this.handleDidHideSuggestion(decorator)
        }

        if (activeRequest) {
            autoeditAnalyticsLogger.markAsRejected(activeRequest.requestId)
        }
    }

    public async renderInlineDecorations(decorationInfo: DecorationInfo): Promise<void> {
        if (!this.decorator) {
            // No decorator to render the decorations
            return
        }
        this.decorator.setDecorations(decorationInfo)
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
    }

    public async renderInlineDecorationsV2(decorations: AutoEditInlineDecorations[]): Promise<void> {
        if (!this.decorator) {
            // No decorator to render the decorations
            return
        }
        this.decorator.setDecorationsV2(decorations)
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
    }

    tryMakeInlineCompletions({
        requestId,
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
            completionMatchesSuffix(updatedPrediction, docContext.currentLineSuffix) &&
            // The new lines suggested after the current line must be equal to the prediction.
            updatedPrediction.endsWith(codeToRewriteAfterCurrentLine)

        if (isPrefixMatch && isSuffixMatch) {
            const autocompleteInlineResponse = extractInlineCompletionFromRewrittenCode(
                updatedPrediction,
                codeToReplaceData.codeToRewritePrefix,
                codeToReplaceData.codeToRewriteSuffix
            )

            if (autocompleteInlineResponse.trimEnd().length === 0) {
                return {
                    inlineCompletionItems: null,
                    updatedDecorationInfo: null,
                    updatedPrediction,
                }
            }

            const insertText = docContext.currentLinePrefix + autocompleteInlineResponse
            const inlineCompletionItem = new vscode.InlineCompletionItem(
                insertText,
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
            )
            autoeditsOutputChannelLogger.logDebug('tryMakeInlineCompletions', 'insert text', {
                verbose: insertText,
            })
            return {
                inlineCompletionItems: [inlineCompletionItem],
                updatedDecorationInfo: null,
                updatedPrediction,
            }
        }
        autoeditsOutputChannelLogger.logDebugIfVerbose(
            'tryMakeInlineCompletions',
            'Rendering a diff view for auto-edit.'
        )

        return {
            inlineCompletionItems: null,
            updatedDecorationInfo: decorationInfo,
            updatedPrediction: updatedPrediction,
        }
    }

    private hasConflictingDecorations(document: vscode.TextDocument, range: vscode.Range): boolean {
        const existingFixupFile = this.fixupController.maybeFileForUri(document.uri)
        if (!existingFixupFile) {
            // No Edits in this file, no conflicts
            return false
        }

        const existingFixupTasks = this.fixupController.tasksForFile(existingFixupFile)
        if (existingFixupTasks.length === 0) {
            // No Edits in this file, no conflicts
            return false
        }

        // Validate that the decoration position does not conflict with an existing Edit diff
        return existingFixupTasks.some(
            task => task.state === CodyTaskState.Applied && task.selectionRange.intersection(range)
        )
    }

    private determinePreferredRenderStrategy(
        remainingDecorationInfo: DecorationInfo
    ): 'completion' | 'completion-and-decorations' | 'image' {
        console.log('remaining decoration info', remainingDecorationInfo)
        const { addedLines, modifiedLines, removedLines } = remainingDecorationInfo

        const remainingAdditions =
            addedLines.length +
            modifiedLines.filter(line => line.changes.some(change => change.type === 'insert')).length
        const remainingDeletions =
            removedLines.length +
            modifiedLines.filter(line => line.changes.some(change => change.type === 'delete')).length

        if (remainingAdditions === 0 && remainingDeletions === 0) {
            // Nothing else to render, use a completion
            return 'completion'
        }

        if (remainingAdditions === 0 && remainingDeletions > 0) {
            // We have deletions, but no more added code.
            // This is simple to show with a mix of completions and decorations
            return 'completion-and-decorations'
        }

        if (remainingAdditions > 0 && remainingDeletions === 0) {
            // We have only additions, no deletions.
            // This is relatively simple to show with a mix of completions and decorations
            return 'completion-and-decorations'
        }

        // We have both additions and deletions. This means the diff is quite complex to show with
        // just completions and decorations. We should try to render an image instead.
        return 'image'
    }

    public getRenderOutput({
        prediction,
        position,
        decorationInfo,
        docContext,
        document,
        requestId,
    }: GetRenderOutputArgs): {
        inlineCompletionItems: vscode.InlineCompletionItem[] | null
        inlineDecorationItems: AutoEditInlineDecorations[] | null
        updatedPrediction: string
        updatedDecorationInfo: DecorationInfo
    } {
        const { insertText, usedChangeIds } = getCompletionText({
            prediction,
            cursorPosition: position,
            decorationInfo,
        })

        // The current line suffix should not require any char removals to render the completion.
        const isSuffixMatch = completionMatchesSuffix(insertText, docContext.currentLineSuffix)

        let inlineCompletionItems: vscode.InlineCompletionItem[] | null = null

        if (isSuffixMatch) {
            const completionText = docContext.currentLinePrefix + insertText

            inlineCompletionItems = [
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
        }

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

        const renderStrategy = this.determinePreferredRenderStrategy(decorationInfoWithoutUsedChanges)

        if (renderStrategy === 'completion') {
            // Pure completions, lets just render the completion
            return {
                inlineCompletionItems,
                inlineDecorationItems: null,
                updatedPrediction: prediction,
                updatedDecorationInfo: decorationInfoWithoutUsedChanges,
            }
        }

        if (renderStrategy === 'completion-and-decorations') {
            // Mixed completions and decorations
            const textDecorations = this.createModifiedInlineDecorationOptions(
                decorationInfoWithoutUsedChanges
            )
            return {
                // Completion items will be mixed with text decorations
                inlineCompletionItems,
                // Text decorations will be mixed with completion items
                inlineDecorationItems: textDecorations,
                updatedPrediction: prediction,
                updatedDecorationInfo: decorationInfoWithoutUsedChanges,
            }
        }

        // Pure image. Let's try to render the image...
        const mode: DiffMode = 'unified'
        const { diff, target } = makeVisualDiff(decorationInfo, mode, document)
        const maxWidth = document.lineAt(target.line).range.end.character + diff.lines[0].text.length

        if (maxWidth > 120) {
            // Although we wanted to render an image, we don't have the available space in the editor to ensure
            // it is visible. We should prefer inline decorations here.
            const textDecorations = this.createModifiedInlineDecorationOptions(
                decorationInfoWithoutUsedChanges
            )
            return {
                // Completion items will be mixed with text decorations
                inlineCompletionItems,
                // Text decorations will be mixed with completion items
                inlineDecorationItems: textDecorations,
                updatedPrediction: prediction,
                updatedDecorationInfo: decorationInfoWithoutUsedChanges,
            }
        }

        // We can safely render the image
        const imageDecorations = this.createModifiedImageDecorationOptions(diff, target, mode, document)
        return {
            // Completion items will be mixed with image decorations
            inlineCompletionItems: null,
            // Image decorations will be mixed with completion items
            inlineDecorationItems: imageDecorations,
            updatedPrediction: prediction,
            updatedDecorationInfo: decorationInfo,
        }
    }

    /**
     * Process modified lines to create decorations for inserted and deleted text within those lines.
     */
    private createModifiedInlineDecorationOptions({
        modifiedLines,
    }: DecorationInfo): AutoEditInlineDecorations[] {
        const added: vscode.DecorationOptions[] = []
        const removed: vscode.DecorationOptions[] = []

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
                            added.push(
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
                        added.push(
                            this.createGhostTextDecoration(currentInsertPosition, currentInsertText)
                        )
                        currentInsertPosition = null
                        currentInsertText = ''
                    }

                    // Handle deletions within modified lines
                    if (change.type === 'delete') {
                        removed.push(
                            this.createRemovedDecoration(change.originalRange, change.text.length)
                        )
                    }
                }
            }

            // After processing all changes in the line, ensure the last insert group is added
            if (currentInsertPosition) {
                added.push(this.createGhostTextDecoration(currentInsertPosition, currentInsertText))
                currentInsertPosition = null
                currentInsertText = ''
            }
        }

        return [
            { type: this.addedTextDecorationType, options: added },
            { type: this.removedTextDecorationType, options: removed },
        ]
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

    private createModifiedImageDecorationOptions(
        diff: VisualDiff,
        target: { line: number; offset: number },
        mode: DiffMode,
        document: vscode.TextDocument
    ): AutoEditInlineDecorations[] {
        const { dark, light, pixelRatio } = generateSuggestionAsImage({
            diff,
            lang: document.languageId,
            mode,
        })

        // The padding in which to offset the decoration image away from neighbouring code
        const decorationPadding = 4
        const startLineEndColumn = getEndColumnForLine(document.lineAt(target.line), document)
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

        // TODO: Implement insert marker decoration. Or make it better?
        // this.editor.setDecorations(this.insertMarkerDecorationType, [
        //     {
        //         range: new vscode.Range(startLine, 0, startLine, startLineEndColumn),
        //     },
        // ])

        return [
            {
                type: this.imageDecorationType,
                options: [
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
            },
        ]
    }

    public dispose(): void {
        this.rejectActiveEdit()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
