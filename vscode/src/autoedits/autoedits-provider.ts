import { type AutoEditsTokenLimit, type DocumentContext, tokensToChars } from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { getCurrentDocContext } from '../completions/get-current-doc-context'
import { getConfiguration } from '../configuration'
import { autoeditsLogger } from './logger'
import type { PromptProvider } from './prompt-provider'
import type { CodeToReplaceData } from './prompt-utils'
import { DeepSeekPromptProvider } from './providers/deepseek'
import { FireworksPromptProvider } from './providers/fireworks'
import { OpenAIPromptProvider } from './providers/openai'
import { AutoEditsRendererManager } from './renderer'

const AUTOEDITS_CONTEXT_STRATEGY = 'auto-edits'
const DEFAULT_DEBOUNCE_INTERVAL_MS = 250

export interface AutoEditsProviderOptions {
    document: vscode.TextDocument
    position: vscode.Position
    abortSignal?: AbortSignal
}

export interface AutoeditsPrediction {
    codeToReplaceData: CodeToReplaceData
    prediction: string
}

/**
 * Provides inline completions and auto-edits functionality.
 */
export class AutoeditsProvider implements vscode.InlineCompletionItemProvider, vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = []
    private readonly contextMixer: ContextMixer
    private readonly rendererManager: AutoEditsRendererManager
    private readonly debounceIntervalMs: number

    private autoEditsTokenLimit?: AutoEditsTokenLimit
    private provider?: PromptProvider
    private model?: string
    private apiKey?: string

    constructor() {
        this.contextMixer = new ContextMixer({
            strategyFactory: new DefaultContextStrategyFactory(
                Observable.of(AUTOEDITS_CONTEXT_STRATEGY)
            ),
            dataCollectionEnabled: false,
        })
        this.rendererManager = new AutoEditsRendererManager()
        this.debounceIntervalMs = DEFAULT_DEBOUNCE_INTERVAL_MS

        this.initializeFromConfig()
        this.registerCommands()
    }

    private initializeFromConfig(): void {
        const config = getConfiguration().experimentalAutoedits
        if (!config) {
            autoeditsLogger.logDebug('Config', 'No Configuration found in the settings')
            return
        }
        this.initializePromptProvider(config.provider)
        this.autoEditsTokenLimit = config.tokenLimit as AutoEditsTokenLimit
        this.model = config.model
        this.apiKey = config.apiKey
    }

    private registerCommands(): void {
        this.disposables.push(
            this.contextMixer,
            this.rendererManager,
            // Command is used to manually debug the autoedits provider
            vscode.commands.registerCommand('cody.experimental.suggest', () => {
                const editor = vscode.window.activeTextEditor
                if (!editor) {
                    return
                }
                this.provideInlineCompletionItems(editor.document, editor.selection.active, {
                    triggerKind: vscode.InlineCompletionTriggerKind.Invoke,
                    selectedCompletionInfo: undefined,
                })
            })
        )
    }

    public async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token?: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {
        const controller = new AbortController()
        token?.onCancellationRequested(() => controller.abort())

        await new Promise(resolve => setTimeout(resolve, this.debounceIntervalMs))
        return this.doProvideAutoEditsItems(document, position, controller.signal)
    }

    public async doProvideAutoEditsItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        abortSignal: AbortSignal
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {
        if (abortSignal.aborted) {
            return null
        }
        const autoeditResponse = await this.predictAutoeditAtDocAndPosition({
            document,
            position,
            abortSignal,
        })
        if (abortSignal.aborted || !autoeditResponse) {
            return null
        }
        return this.handleAutoeditResponse(document, position, autoeditResponse)
    }

    private async handleAutoeditResponse(
        document: vscode.TextDocument,
        position: vscode.Position,
        autoeditResponse: AutoeditsPrediction
    ): Promise<vscode.InlineCompletionItem[] | null> {
        const { prediction, codeToReplaceData } = autoeditResponse
        const isPrefixMatch = prediction.startsWith(codeToReplaceData.codeToRewritePrefix)
        const isSuffixMatch = prediction.endsWith(codeToReplaceData.codeToRewriteSuffix)

        this.logDebugData(isPrefixMatch, isSuffixMatch, autoeditResponse)

        if (isPrefixMatch && isSuffixMatch) {
            const autocompleteResponse = this.extractInlineCompletion(autoeditResponse)
            return [new vscode.InlineCompletionItem(autocompleteResponse)]
        }

        this.handleAutoeditsDecorations(document, position, codeToReplaceData, prediction)
        return null
    }

    private async handleAutoeditsDecorations(
        document: vscode.TextDocument,
        position: vscode.Position,
        codeToReplaceData: CodeToReplaceData,
        prediction: string
    ): Promise<void> {
        const range = new vscode.Range(
            new vscode.Position(codeToReplaceData.startLine, 0),
            document.lineAt(codeToReplaceData.endLine).rangeIncludingLineBreak.end
        )
        const currentFileText = document.getText()
        const predictedFileText =
            currentFileText.slice(0, document.offsetAt(range.start)) +
            prediction +
            currentFileText.slice(document.offsetAt(range.end))

        await this.rendererManager.displayProposedEdit({
            document,
            range,
            prediction,
            currentFileText,
            predictedFileText,
        })
    }

    private logDebugData(
        isPrefixMatch: boolean,
        isSuffixMatch: boolean,
        response: AutoeditsPrediction
    ): void {
        const debugData = {
            isPrefixMatch,
            isSuffixMatch,
            prediction: JSON.stringify(response.prediction),
            codeToRewritePrefix: JSON.stringify(response.codeToReplaceData.codeToRewritePrefix),
            codeToRewriteSuffix: JSON.stringify(response.codeToReplaceData.codeToRewriteSuffix),
        }
        autoeditsLogger.logDebug(
            'InlineCompletions',
            'Data Debug:\n',
            JSON.stringify(debugData, null, 2)
        )
    }

    private extractInlineCompletion(autoeditResponse: AutoeditsPrediction): string {
        const { prediction, codeToReplaceData } = autoeditResponse
        const startIndex = codeToReplaceData.codeToRewritePrefix?.length || 0
        const endIndex = prediction.length - (codeToReplaceData.codeToRewriteSuffix?.length || 0)

        return prediction.slice(startIndex, endIndex)
    }

    private initializePromptProvider(provider: string): void {
        switch (provider) {
            case 'openai':
                this.provider = new OpenAIPromptProvider()
                break
            case 'deepseek':
                this.provider = new DeepSeekPromptProvider()
                break
            case 'fireworks':
                this.provider = new FireworksPromptProvider()
                break
            default:
                autoeditsLogger.logDebug('Config', `Provider ${provider} not supported`)
                this.provider = undefined
        }
    }

    public async predictAutoeditAtDocAndPosition(
        options: AutoEditsProviderOptions
    ): Promise<AutoeditsPrediction | null> {
        if (!this.isConfigValid()) {
            return null
        }

        const start = Date.now()
        const prediction = await this.generatePrediction(options)

        if (options.abortSignal?.aborted || !prediction) {
            return null
        }

        autoeditsLogger.logDebug(
            'Autoedits',
            '========================== Response:\n',
            JSON.stringify(prediction),
            '\n',
            '========================== Time Taken For LLM (Msec): ',
            (Date.now() - start).toString(),
            '\n'
        )

        return prediction
    }

    private isConfigValid(): boolean {
        if (!this.provider || !this.autoEditsTokenLimit || !this.model || !this.apiKey) {
            autoeditsLogger.logDebug('Config', 'No Provider or Token Limit found in the settings')
            return false
        }
        return true
    }

    private async generatePrediction(
        options: AutoEditsProviderOptions
    ): Promise<AutoeditsPrediction | null> {
        const docContext = this.getDocContext(options.document, options.position)
        const { context } = await this.contextMixer.getContext({
            document: options.document,
            position: options.position,
            docContext,
            maxChars: 100000,
        })

        const { codeToReplace, promptResponse: prompt } = this.provider!.getPrompt(
            docContext,
            options.document,
            options.position,
            context,
            this.autoEditsTokenLimit!
        )

        const response = await this.provider!.getModelResponse(this.model!, this.apiKey!, prompt)
        const postProcessedResponse = this.provider!.postProcessResponse(codeToReplace, response)

        return {
            codeToReplaceData: codeToReplace,
            prediction: postProcessedResponse,
        }
    }

    private getDocContext(document: vscode.TextDocument, position: vscode.Position): DocumentContext {
        return getCurrentDocContext({
            document,
            position,
            maxPrefixLength: tokensToChars(this.autoEditsTokenLimit?.prefixTokens ?? 0),
            maxSuffixLength: tokensToChars(this.autoEditsTokenLimit?.suffixTokens ?? 0),
        })
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
