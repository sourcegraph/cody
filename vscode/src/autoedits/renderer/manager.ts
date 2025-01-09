import * as vscode from 'vscode'

import { type DocumentContext, tokensToChars } from '@sourcegraph/cody-shared'

import {
    completionMatchesSuffix,
    getLatestVisibilityContext,
    isCompletionVisible,
} from '../../completions/is-completion-visible'
import { type AutoeditRequestID, autoeditAnalyticsLogger } from '../analytics-logger'
import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { CodeToReplaceData } from '../prompt/prompt-utils'
import {
    adjustPredictionIfInlineCompletionPossible,
    areSameUriDocs,
    extractInlineCompletionFromRewrittenCode,
} from '../utils'

import type { FixupController } from '../../non-stop/FixupController'
import { CodyTaskState } from '../../non-stop/state'
import type { AutoEditsDecorator, DecorationInfo } from './decorators/base'

export interface TryMakeInlineCompletionsArgs {
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
        if (
            !request ||
            this.hasConflictingDecorations(request.document, request.codeToReplaceData.range)
        ) {
            return
        }

        this.activeRequestId = requestId
        this.decorator = this.createDecorator(vscode.window.activeTextEditor!)

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
        if (
            !editor ||
            !activeRequest ||
            !areSameUriDocs(editor.document, this.activeRequest?.document)
        ) {
            return this.rejectActiveEdit()
        }

        await this.handleDidHideSuggestion(decorator)
        autoeditAnalyticsLogger.markAsAccepted(activeRequest.requestId)

        if (this.activeRequest && this.hasInlineDecorationOnly()) {
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
        this.decorator?.setDecorations(decorationInfo)
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
            'Rendering a diff view for auto-edits.'
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

    public dispose(): void {
        this.rejectActiveEdit()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
