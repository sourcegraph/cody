import * as vscode from 'vscode'

import { type DocumentContext, isFileURI, tokensToChars } from '@sourcegraph/cody-shared'

import { getLatestVisibilityContext, isCompletionVisible } from '../../completions/is-completion-visible'
import {
    type AutoeditRequestID,
    autoeditAnalyticsLogger,
    autoeditDiscardReason,
} from '../analytics-logger'
import { autoeditsProviderConfig } from '../autoedits-config'
import type { CodeToReplaceData } from '../prompt/prompt-utils'
import { areSameUriDocs } from '../utils'

import type { FixupController } from '../../non-stop/FixupController'
import { CodyTaskState } from '../../non-stop/state'
import type { AutoEditDecorations, DecorationInfo } from './decorators/base'
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

export const AUTOEDIT_VISIBLE_DELAY_MS = 750

export class AutoEditsDefaultRendererManager extends AutoEditsRenderOutput implements vscode.Disposable {
    // Keeps track of the current active edit (there can only be one active edit at a time)
    protected activeRequestId: AutoeditRequestID | null = null
    protected disposables: vscode.Disposable[] = []
    /**
     * The amount of time before we consider a suggestion to be "visible" to the user.
     */
    private autoeditSuggestedTimeoutId: NodeJS.Timeout | undefined

    private decorator = new InlineDiffDecorator()

    constructor(protected fixupController: FixupController) {
        super()
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

    /**
     * TODO: Test and update this with default manager implementation
     */
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

    // protected onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): void {
    //     if (
    //         // Only dismiss if there are inline decorations, as inline completion items rely on
    //         // a native acceptance/rejection mechanism that we can't interfere with.
    //         //
    //         // For instance, the acceptance command is triggered only after the document changes.
    //         // This means we can't depend on document or selection changes to handle cases where
    //         // inline completion items are accepted because they get rejected before the
    //         // acceptance callback is fired by VS Code.
    //         this.hasInlineDecorationOnly() &&
    //         this.activeRequest &&
    //         areSameUriDocs(event.textEditor.document, this.activeRequest?.document)
    //     ) {
    //         const currentSelectionRange = event.selections.at(-1)
    //         if (!currentSelectionRange?.intersection(this.activeRequest.codeToReplaceData.range)) {
    //             this.rejectActiveEdit()
    //         }
    //     }
    // }

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

    protected async handleDidHideSuggestion(): Promise<void> {
        const editor = vscode.window.activeTextEditor
        if (editor) {
            this.decorator.hideDecorations(editor)
            // Hide any visible decorations
            await vscode.commands.executeCommand('setContext', 'cody.supersuggest.active', false)
        }

        // Hide inline completion provider item ghost text
        await vscode.commands.executeCommand('editor.action.inlineSuggest.hide')

        this.activeRequestId = null
    }

    protected async acceptActiveEdit(): Promise<void> {
        const editor = vscode.window.activeTextEditor
        const { activeRequest } = this
        // Compute this variable before the `handleDidHideSuggestion` call which removes the active request.
        const hasInlineDecorationOnly = this.hasInlineDecorationOnly()

        if (!editor || !activeRequest || !areSameUriDocs(editor.document, activeRequest?.document)) {
            return this.rejectActiveEdit()
        }

        await this.handleDidHideSuggestion()
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
        await this.handleDidHideSuggestion()

        if (this.activeRequest) {
            autoeditAnalyticsLogger.markAsRejected(this.activeRequest.requestId)
        }
    }

    public async renderInlineDecorations(
        editor: vscode.TextEditor,
        decorations: AutoEditDecorations
    ): Promise<void> {
        this.decorator.showDecorations(editor, decorations)
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

    public dispose(): void {
        this.rejectActiveEdit()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
