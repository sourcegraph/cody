import * as vscode from 'vscode'

import { type CodeToReplaceData, type DocumentContext, tokensToChars } from '@sourcegraph/cody-shared'

import { getLatestVisibilityContext, isCompletionVisible } from '../../completions/is-completion-visible'
import { isRunningInsideAgent } from '../../jsonrpc/isRunningInsideAgent'
import type { FixupController } from '../../non-stop/FixupController'
import { CodyTaskState } from '../../non-stop/state'
import {
    type AutoeditAcceptReasonMetadata,
    type AutoeditRejectReasonMetadata,
    type AutoeditRequestID,
    type Phase,
    autoeditAcceptReason,
    autoeditAnalyticsLogger,
    autoeditDiscardReason,
    autoeditRejectReason,
} from '../analytics-logger'
import { autoeditsProviderConfig } from '../autoedits-config'
import type { RequestManager } from '../request-manager'
import { areSameUriDocs } from '../utils'

import type { AutoEditDecorations, AutoEditsDecorator, DecorationInfo } from './decorators/base'
import { InlineDiffDecorator } from './decorators/inline-diff-decorator'
import { AutoEditsRenderOutput } from './render-output'

export interface TryMakeInlineCompletionsArgs {
    requestId: AutoeditRequestID
    prediction: string
    codeToReplaceData: CodeToReplaceData
    document: vscode.TextDocument
    position: vscode.Position
    docContext: DocumentContext
    decorationInfo: DecorationInfo
}

export const DEFAULT_AUTOEDIT_VISIBLE_DELAY_MS = 750

export class AutoEditsRendererManager extends AutoEditsRenderOutput {
    // Keeps track of the current active edit (there can only be one active edit at a time)
    protected activeRequestId: AutoeditRequestID | null = null
    protected disposables: vscode.Disposable[] = []
    protected decorator: AutoEditsDecorator = new InlineDiffDecorator()

    /**
     * The amount of time before we consider a suggestion to be "visible" to the user.
     */
    private autoeditSuggestedTimeoutId: NodeJS.Timeout | undefined

    constructor(
        protected fixupController: FixupController,
        // Used to remove cached suggestions when one is accepted or rejected.
        protected requestManager: RequestManager
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

    protected get activeRequest() {
        if (this.activeRequestId) {
            const request = autoeditAnalyticsLogger.getRequest(this.activeRequestId)
            if (request && 'renderOutput' in request && request.renderOutput.type !== 'none') {
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

        return ['decorations', 'image'].includes(this.activeRequest.renderOutput.type)
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

    public hasInlineCompletionItems(): boolean {
        if (!this.activeRequest) {
            return false
        }
        return ['completion', 'completion-with-decorations'].includes(
            this.activeRequest.renderOutput.type
        )
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
                        predictionDocContext,
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
                            docContext: predictionDocContext,
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

    protected async handleDidHideSuggestion(): Promise<void> {
        // Hide inline decorations
        this.decorator.hideDecorations()
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', false)

        // Hide inline completion provider item ghost text
        await vscode.commands.executeCommand('editor.action.inlineSuggest.hide')

        this.activeRequestId = null
    }

    public handleDidAcceptCompletionItem(requestId: AutoeditRequestID): Promise<void> {
        return this.acceptActiveEdit(autoeditAcceptReason.acceptCommand)
    }

    protected async acceptActiveEdit(acceptReason: AutoeditAcceptReasonMetadata): Promise<void> {
        const editor = vscode.window.activeTextEditor
        const { activeRequest } = this

        // Compute this variable before the `handleDidHideSuggestion` call which removes the active request.
        const hasInlineDecorations = this.hasInlineDecorations()

        if (
            !editor ||
            !activeRequest ||
            !areSameUriDocs(editor.document, this.activeRequest?.document)
        ) {
            return this.rejectActiveEdit(autoeditRejectReason.acceptActiveEdit)
        }

        this.requestManager.removeFromCache(activeRequest.cacheId)

        // Reset the testing promise when accepting
        this.testing_completionSuggestedPromise = undefined

        await this.handleDidHideSuggestion()
        autoeditAnalyticsLogger.markAsAccepted({
            requestId: activeRequest.requestId,
            acceptReason,
        })

        // If we have a hot-streak ID, store it so that we can use it when searching in the cache
        // in the next call to `provideInlineCompletionItems`.
        this.requestManager.lastAcceptedHotStreakId = activeRequest.hotStreakId

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
        const { activeRequest } = this

        if (activeRequest) {
            this.requestManager.removeFromCache(activeRequest.cacheId)
        }

        // Reset the testing promise when rejecting
        this.testing_completionSuggestedPromise = undefined

        await this.handleDidHideSuggestion()

        if (activeRequest) {
            autoeditAnalyticsLogger.markAsRejected({
                requestId: activeRequest.requestId,
                rejectReason,
            })
        }
    }

    public async renderInlineDecorations(
        uri: vscode.Uri,
        decorations: AutoEditDecorations
    ): Promise<void> {
        this.decorator.setDecorations(uri, decorations)
        await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', true)
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
