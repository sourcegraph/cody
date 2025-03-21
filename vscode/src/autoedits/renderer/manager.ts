import * as vscode from 'vscode'

import { type DocumentContext, tokensToChars } from '@sourcegraph/cody-shared'

import {
    completionMatchesSuffix,
    getLatestVisibilityContext,
    isCompletionVisible,
} from '../../completions/is-completion-visible'
import {
    type AutoeditAcceptReasonMetadata,
    type AutoeditRejectReasonMetadata,
    type AutoeditRequestID,
    type AutoeditRequestStateForAgentTesting,
    type Phase,
    autoeditAcceptReason,
    autoeditAnalyticsLogger,
    autoeditDiscardReason,
    autoeditRejectReason,
} from '../analytics-logger'
import { autoeditsProviderConfig } from '../autoedits-config'
import type { CodeToReplaceData } from '../prompt/prompt-utils'
import {
    adjustPredictionIfInlineCompletionPossible,
    areSameUriDocs,
    extractInlineCompletionFromRewrittenCode,
} from '../utils'

import { isRunningInsideAgent } from '../../jsonrpc/isRunningInsideAgent'
import type { FixupController } from '../../non-stop/FixupController'
import { CodyTaskState } from '../../non-stop/state'
import { AutoeditCompletionItem } from '../autoedit-completion-item'
import type { AutoeditClientCapabilities } from '../autoedits-provider'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { AutoEditDecorations, AutoEditsDecorator, DecorationInfo } from './decorators/base'
import {
    type AutoEditRenderOutput,
    AutoEditsRenderOutput,
    type GetRenderOutputArgs,
} from './render-output'

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
    getRenderOutput(
        args: GetRenderOutputArgs,
        capabilities: AutoeditClientCapabilities
    ): AutoEditRenderOutput

    handleDidShowSuggestion(requestId: AutoeditRequestID): Promise<void>

    handleDidAcceptCompletionItem(requestId: AutoeditRequestID): Promise<void>

    /**
     * Renders the prediction as inline decorations.
     */
    renderInlineDecorations(
        /**
         * @deprecated Use `decorations` instead.
         */
        decorationInfo: DecorationInfo,
        decorations?: AutoEditDecorations
    ): Promise<void>

    /**
     * Determines if we have a rendered autoedit suggested.
     */
    hasActiveEdit(): boolean

    /**
     * Promise that resolves with the request ID when the timeout completes.
     * Used for agent integration tests to wait for the visibility timeout.
     */
    testing_completionSuggestedPromise: Promise<AutoeditRequestID> | undefined

    /**
     * Method for test harnesses to control the completion visibility delay.
     */
    testing_setCompletionVisibilityDelay(delay: number): void

    /**
     * Method for test harnesses to get a specific request.
     */
    testing_getTestingAutoeditEvent(id: AutoeditRequestID): AutoeditRequestStateForAgentTesting

    /**
     * Dismissed an active edit and frees resources.
     */
    dispose(): void
}

export const DEFAULT_AUTOEDIT_VISIBLE_DELAY_MS = 750

export class AutoEditsDefaultRendererManager
    extends AutoEditsRenderOutput
    implements AutoEditsRendererManager
{
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
        super()
        this.disposables.push(
            vscode.commands.registerCommand('cody.supersuggest.accept', () =>
                this.acceptActiveEdit(autoeditAcceptReason.acceptCommand)
            ),
            vscode.commands.registerCommand('cody.supersuggest.dismiss', () =>
                this.rejectActiveEdit(autoeditRejectReason.dismissCommand)
            ),
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
            this.rejectActiveEdit(autoeditRejectReason.onDidChangeTextDocument)
        }
    }

    protected onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined): void {
        if (!editor || !areSameUriDocs(editor.document, this.activeRequest?.document)) {
            this.rejectActiveEdit(autoeditRejectReason.onDidChangeActiveTextEditor)
        }
    }

    protected onDidCloseTextDocument(document: vscode.TextDocument): void {
        if (areSameUriDocs(document, this.activeRequest?.document)) {
            this.rejectActiveEdit(autoeditRejectReason.onDidCloseTextDocument)
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
                this.rejectActiveEdit(autoeditRejectReason.onDidChangeTextEditorSelection)
            }
        }
    }

    protected get activeRequest() {
        if (this.activeRequestId) {
            const request = autoeditAnalyticsLogger.getRequest(this.activeRequestId)
            if (
                request &&
                'renderOutput' in request &&
                request.renderOutput.type !== 'none' &&
                this.decorator
            ) {
                return request
            }
        }
        return undefined
    }

    public hasActiveEdit(): boolean {
        return this.activeRequestId !== null
    }

    public hasInlineDecorationOnly(): boolean {
        if (!this.activeRequest) {
            return false
        }

        return ['decorations', 'image', 'legacy-decorations'].includes(
            this.activeRequest.renderOutput.type
        )
    }

    public hasInlineDecorations(): boolean {
        // Fall through to hasInlineDecorationOnly, the default manager does not support cases
        // where decorations can be rendered alongside completions.
        return this.hasInlineDecorationOnly()
    }

    public async handleDidShowSuggestion(requestId: AutoeditRequestID): Promise<void> {
        await this.rejectActiveEdit(autoeditRejectReason.handleDidShowSuggestion)

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
        this.activeRequestId = requestId
        autoeditAnalyticsLogger.markAsSuggested(requestId)

        // Clear any existing timeouts, only one suggestion can be shown at a time
        clearTimeout(this.autoeditSuggestedTimeoutId)

        this.testing_completionSuggestedPromise = new Promise(resolve => {
            // Mark suggestion as read after a delay if it's still visible
            this.autoeditSuggestedTimeoutId = setTimeout(() => {
                resolve(requestId)
                this.testing_completionSuggestedPromise = undefined

                if (this.activeRequest?.requestId === requestId) {
                    const {
                        document: invokedDocument,
                        position: invokedPosition,
                        docContext,
                        renderOutput,
                    } = this.activeRequest

                    const { activeTextEditor } = vscode.window

                    if (
                        !activeTextEditor ||
                        !areSameUriDocs(activeTextEditor.document, invokedDocument)
                    ) {
                        // User is no longer in the same document as the completion
                        return
                    }

                    const inlineCompletionItems =
                        'inlineCompletionItems' in renderOutput ? renderOutput.inlineCompletionItems : []
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
                            maxPrefixLength: tokensToChars(
                                autoeditsProviderConfig.tokenLimit.prefixTokens
                            ),
                            maxSuffixLength: tokensToChars(
                                autoeditsProviderConfig.tokenLimit.suffixTokens
                            ),
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
            }, this.AUTOEDIT_VISIBLE_DELAY_MS)
        })
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

    public handleDidAcceptCompletionItem(requestId: AutoeditRequestID): Promise<void> {
        return this.acceptActiveEdit(autoeditAcceptReason.acceptCommand)
    }

    protected async acceptActiveEdit(acceptReason: AutoeditAcceptReasonMetadata): Promise<void> {
        const editor = vscode.window.activeTextEditor
        const { activeRequest, decorator } = this
        // Compute this variable before the `handleDidHideSuggestion` call which removes the active request.
        const hasInlineDecorations = this.hasInlineDecorations()

        if (
            !editor ||
            !activeRequest ||
            !areSameUriDocs(editor.document, this.activeRequest?.document)
        ) {
            return this.rejectActiveEdit(autoeditRejectReason.acceptActiveEdit)
        }

        // Reset the testing promise when accepting
        this.testing_completionSuggestedPromise = undefined

        await this.handleDidHideSuggestion(decorator)
        autoeditAnalyticsLogger.markAsAccepted({
            requestId: activeRequest.requestId,
            acceptReason,
        })

        if (isRunningInsideAgent()) {
            // We rely on the agent for accepting
            return
        }

        if (!hasInlineDecorations) {
            // We rely on the native VS Code functionality for accepting pure inline completions items.
            return
        }

        // For other cases we must perform the edit ourselves. This includes cases where we have mixed
        // completions and inline decorations. In those cases, we do the full edit and ignore the completion
        // acceptance mechanism.
        await editor.edit(editBuilder => {
            editBuilder.replace(activeRequest.codeToReplaceData.range, activeRequest.prediction)
        })
    }

    protected async rejectActiveEdit(rejectReason: AutoeditRejectReasonMetadata): Promise<void> {
        const { activeRequest, decorator } = this

        // Reset the testing promise when rejecting
        this.testing_completionSuggestedPromise = undefined

        if (decorator) {
            await this.handleDidHideSuggestion(this.decorator)
        }

        if (activeRequest) {
            autoeditAnalyticsLogger.markAsRejected({
                requestId: activeRequest.requestId,
                rejectReason,
            })
        }
    }

    public async renderInlineDecorations(
        decorationInfo: DecorationInfo,
        decorations?: AutoEditDecorations
    ): Promise<void> {
        if (!this.decorator) {
            // No decorator to render the decorations
            return
        }
        this.decorator.setDecorations(decorationInfo, decorations)
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
    }

    public getRenderOutput(
        {
            requestId,
            prediction,
            codeToReplaceData,
            document,
            position,
            docContext,
        }: GetRenderOutputArgs,
        capabilities?: AutoeditClientCapabilities
    ): AutoEditRenderOutput {
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
                return { type: 'none' }
            }

            const insertText = docContext.currentLinePrefix + autocompleteInlineResponse
            const inlineCompletionItem = new AutoeditCompletionItem({
                id: requestId,
                insertText,
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
            })
            autoeditsOutputChannelLogger.logDebug('tryMakeInlineCompletions', 'insert text', {
                verbose: insertText,
            })
            return {
                type: 'legacy-completion',
                inlineCompletionItems: [inlineCompletionItem],
                updatedDecorationInfo: null,
                updatedPrediction,
            }
        }
        autoeditsOutputChannelLogger.logDebugIfVerbose(
            'tryMakeInlineCompletions',
            'Rendering a diff view for auto-edit.'
        )

        return { type: 'legacy-decorations' }
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

    /**
     * The amount of time before we consider an auto-edit to be "visible" to the user.
     */
    private AUTOEDIT_VISIBLE_DELAY_MS = DEFAULT_AUTOEDIT_VISIBLE_DELAY_MS

    /**
     * Promise that resolves with the request ID when the timeout completes.
     * Used for agent integration tests to wait for the visibility timeout.
     */
    public testing_completionSuggestedPromise: Promise<AutoeditRequestID> | undefined = undefined

    /**
     * Method for test harnesses to control the completion visibility delay.
     */
    public testing_setCompletionVisibilityDelay(delay: number): void {
        this.AUTOEDIT_VISIBLE_DELAY_MS = delay
    }

    /**
     * Method for test harnesses to get the active request.
     */
    public testing_getTestingAutoeditEvent(id: AutoeditRequestID): { phase?: Phase; read?: boolean } {
        const request = autoeditAnalyticsLogger.getRequest(id)
        const payload = request?.payload
        return {
            phase: request?.phase,
            read: payload && 'isRead' in payload ? payload.isRead : undefined,
        }
    }

    public dispose(): void {
        this.rejectActiveEdit(autoeditRejectReason.disposal)
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
