import { type DebouncedFunc, debounce } from 'lodash'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'

import {
    type ChatClient,
    type DocumentContext,
    currentResolvedConfig,
    tokensToChars,
} from '@sourcegraph/cody-shared'

import { ContextRankingStrategy } from '../completions/context/completions-context-ranker'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { getCurrentDocContext } from '../completions/get-current-doc-context'

import type { AutoeditsModelAdapter } from './adapters/base'
import { createAutoeditsModelAdapter } from './adapters/create-adapter'
import { autoeditsProviderConfig } from './autoedits-config'
import { FilterPredictionBasedOnRecentEdits } from './filter-prediction-edits'
import { autoeditsLogger } from './logger'
import type { CodeToReplaceData } from './prompt/prompt-utils'
import { ShortTermPromptStrategy } from './prompt/short-term-diff-prompt-strategy'
import { DefaultDecorator } from './renderer/decorators/default-decorator'
import { InlineDiffDecorator } from './renderer/decorators/inline-diff-decorator'
import { getDecorationInfo } from './renderer/diff-utils'
import { AutoEditsInlineRendererManager } from './renderer/inline-manager'
import { AutoEditsDefaultRendererManager, type AutoEditsRendererManager } from './renderer/manager'
import {
    extractAutoEditResponseFromCurrentDocumentCommentTemplate,
    shrinkReplacerTextToCodeToReplaceRange,
} from './renderer/renderer-testing'
import { shrinkPredictionUntilSuffix } from './shrink-prediction'
import { isPredictedTextAlreadyInSuffix } from './utils'

const AUTOEDITS_CONTEXT_STRATEGY = 'auto-edits'
const INLINE_COMPLETION_DEFAULT_DEBOUNCE_INTERVAL_MS = 150
const ON_SELECTION_CHANGE_DEFAULT_DEBOUNCE_INTERVAL_MS = 150
const RESET_SUGGESTION_ON_CURSOR_CHANGE_AFTER_INTERVAL_MS = 60 * 1000

export interface AutoEditsProviderOptions {
    document: vscode.TextDocument
    position: vscode.Position
    docContext: DocumentContext
    abortSignal?: AbortSignal
}

export interface AutoeditsPrediction {
    codeToReplaceData: CodeToReplaceData
    prediction: string
}

/**
 * Provides inline completions and auto-edits functionality.
 *
 * Before introducing new logic into the AutoEditsProvider class, evaluate whether it can be abstracted into a separate component.
 * This practice ensures that AutoEditsProvider remains focused on its primary responsibilities of triggering and providing completions
 */
export class AutoeditsProvider implements vscode.InlineCompletionItemProvider, vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = []
    /** Keeps track of the last time the text was changed in the editor. */
    private lastTextChangeTimeStamp: number | undefined
    private readonly onSelectionChangeDebounced: DebouncedFunc<typeof this.onSelectionChange>
    public readonly rendererManager: AutoEditsRendererManager
    private readonly modelAdapter: AutoeditsModelAdapter

    private readonly promptStrategy = new ShortTermPromptStrategy()
    public readonly filterPrediction = new FilterPredictionBasedOnRecentEdits()
    private readonly contextMixer = new ContextMixer({
        strategyFactory: new DefaultContextStrategyFactory(Observable.of(AUTOEDITS_CONTEXT_STRATEGY)),
        contextRankingStrategy: ContextRankingStrategy.TimeBased,
        dataCollectionEnabled: false,
    })

    constructor(chatClient: ChatClient) {
        this.modelAdapter = createAutoeditsModelAdapter({
            providerName: autoeditsProviderConfig.provider,
            isChatModel: autoeditsProviderConfig.isChatModel,
            chatClient: chatClient,
        })

        const enabledRenderer = vscode.workspace
            .getConfiguration()
            .get<'default' | 'inline'>('cody.experimental.autoedits.renderer', 'default')

        this.rendererManager =
            enabledRenderer === 'inline'
                ? new AutoEditsInlineRendererManager(editor => new InlineDiffDecorator(editor))
                : new AutoEditsDefaultRendererManager(
                      (editor: vscode.TextEditor) => new DefaultDecorator(editor)
                  )

        this.onSelectionChangeDebounced = debounce(
            (event: vscode.TextEditorSelectionChangeEvent) => this.onSelectionChange(event),
            ON_SELECTION_CHANGE_DEFAULT_DEBOUNCE_INTERVAL_MS
        )

        this.disposables.push(
            this.contextMixer,
            this.rendererManager,
            vscode.window.onDidChangeTextEditorSelection(this.onSelectionChangeDebounced),
            vscode.workspace.onDidChangeTextDocument(event => {
                this.onDidChangeTextDocument(event)
            })
        )
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        if (event.document.uri.scheme !== 'file') {
            return
        }
        this.lastTextChangeTimeStamp = Date.now()
    }

    private async onSelectionChange(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
        const lastSelection = event.selections.at(-1)
        const { document } = event.textEditor
        if (!lastSelection?.isEmpty || document.uri.scheme !== 'file') {
            return
        }
        if (this.rendererManager.hasActiveEdit()) {
            return
        }
        // Don't show suggestion on cursor movement if the text has not changed for a certain amount of time
        if (
            this.lastTextChangeTimeStamp &&
            Date.now() - this.lastTextChangeTimeStamp <
                RESET_SUGGESTION_ON_CURSOR_CHANGE_AFTER_INTERVAL_MS
        ) {
            await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
        }
    }

    public async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token?: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {
        const controller = new AbortController()
        const abortSignal = controller.signal
        token?.onCancellationRequested(() => controller.abort())

        await new Promise(resolve => setTimeout(resolve, INLINE_COMPLETION_DEFAULT_DEBOUNCE_INTERVAL_MS))
        if (abortSignal.aborted) {
            return null
        }

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: tokensToChars(autoeditsProviderConfig.tokenLimit.prefixTokens),
            maxSuffixLength: tokensToChars(autoeditsProviderConfig.tokenLimit.suffixTokens),
        })

        const autoeditResponse = await this.inferEdit({
            document,
            position,
            docContext,
            abortSignal,
        })

        if (abortSignal.aborted || !autoeditResponse) {
            return null
        }

        let { prediction, codeToReplaceData } = autoeditResponse
        const { codeToRewrite } = codeToReplaceData

        const shouldFilterPredictionBasedRecentEdits = this.filterPrediction.shouldFilterPrediction(
            document.uri,
            prediction,
            codeToRewrite
        )

        if (shouldFilterPredictionBasedRecentEdits) {
            autoeditsLogger.logDebug('Autoedits', 'Skipping autoedit - based on recent edits')
            return null
        }

        prediction = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        if (prediction === codeToRewrite) {
            autoeditsLogger.logDebug(
                'Autoedits',
                'Skipping autoedit - prediction equals to code to rewrite'
            )
            return null
        }

        const currentFileText = document.getText()
        const predictedFileText =
            currentFileText.slice(0, document.offsetAt(codeToReplaceData.range.start)) +
            prediction +
            currentFileText.slice(document.offsetAt(codeToReplaceData.range.end))

        const decorationInfo = getDecorationInfo(currentFileText, predictedFileText)

        if (
            isPredictedTextAlreadyInSuffix({
                codeToRewrite,
                decorationInfo,
                suffix: codeToReplaceData.suffixInArea + codeToReplaceData.suffixAfterArea,
            })
        ) {
            autoeditsLogger.logDebug(
                'Autoedits',
                'Skipping autoedit - predicted text already exists in suffix'
            )
            return null
        }

        const { inlineCompletions } =
            await this.rendererManager.maybeRenderDecorationsAndTryMakeInlineCompletionResponse(
                prediction,
                codeToReplaceData,
                document,
                position,
                docContext,
                decorationInfo
            )

        return inlineCompletions
    }

    private async inferEdit(options: AutoEditsProviderOptions): Promise<AutoeditsPrediction | null> {
        const start = Date.now()
        const { document, position, docContext, abortSignal } = options

        const { context } = await this.contextMixer.getContext({
            document,
            position,
            docContext,
            maxChars: 32_000,
        })

        const { codeToReplace, prompt } = this.promptStrategy.getPromptForModelType({
            document,
            position,
            docContext,
            context,
            tokenBudget: autoeditsProviderConfig.tokenLimit,
            isChatModel: autoeditsProviderConfig.isChatModel,
        })

        let response: string | undefined = undefined
        if (autoeditsProviderConfig.isMockResponseFromCurrentDocumentTemplateEnabled) {
            const responseMetadata = extractAutoEditResponseFromCurrentDocumentCommentTemplate()

            if (responseMetadata) {
                response = shrinkReplacerTextToCodeToReplaceRange(responseMetadata, codeToReplace)
            }
        }

        if (response === undefined) {
            response = await this.modelAdapter.getModelResponse({
                url: autoeditsProviderConfig.url,
                model: autoeditsProviderConfig.model,
                prompt,
                codeToRewrite: codeToReplace.codeToRewrite,
                userId: (await currentResolvedConfig()).clientState.anonymousUserID,
                isChatModel: autoeditsProviderConfig.isChatModel,
            })
        }

        if (abortSignal?.aborted || !response) {
            return null
        }

        autoeditsLogger.logDebug(
            'Autoedits',
            '========================== Response:\n',
            response,
            '\n',
            '========================== Time Taken For LLM (Msec): ',
            (Date.now() - start).toString(),
            '\n'
        )

        return {
            codeToReplaceData: codeToReplace,
            prediction: response,
        }
    }

    public dispose(): void {
        this.onSelectionChangeDebounced.cancel()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
