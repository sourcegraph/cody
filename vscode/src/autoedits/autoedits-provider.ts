import { type AutoEditsTokenLimit, type DocumentContext, tokensToChars } from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { getCurrentDocContext } from '../completions/get-current-doc-context'
import { getConfiguration } from '../configuration'
import type { PromptProvider } from './prompt-provider'
import type { CodeToReplaceData } from './prompt-utils'
import { DeepSeekPromptProvider } from './providers/deepseek'
import { FireworksPromptProvider } from './providers/fireworks'
import { OpenAIPromptProvider } from './providers/openai'
import { AutoEditsRenderer } from './renderer'

const AUTOEDITS_CONTEXT_STRATEGY = 'auto-edits'

export interface AutoEditsProviderOptions {
    document: vscode.TextDocument
    position: vscode.Position
    abortSignal?: AbortSignal
}

export interface AutoeditsPrediction {
    codeToReplaceData: CodeToReplaceData
    prediction: string
}

export class AutoeditsProvider implements vscode.InlineCompletionItemProvider, vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private contextMixer: ContextMixer = new ContextMixer({
        strategyFactory: new DefaultContextStrategyFactory(Observable.of(AUTOEDITS_CONTEXT_STRATEGY)),
        dataCollectionEnabled: false,
    })
    private autoEditsTokenLimit: AutoEditsTokenLimit | undefined
    private provider: PromptProvider | undefined
    private model: string | undefined
    private apiKey: string | undefined
    private renderer: AutoEditsRenderer = new AutoEditsRenderer()
    private outputChannel: vscode.OutputChannel
    private debounceIntervalMs = 250

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Autoedit Testing')
        const config = getConfiguration().experimentalAutoedits
        if (config === undefined) {
            this.logDebug('AutoEdits', 'No Configuration found in the settings')
            return
        }
        this.initizlizePromptProvider(config.provider)
        this.autoEditsTokenLimit = config.tokenLimit as AutoEditsTokenLimit
        this.model = config.model
        this.apiKey = config.apiKey
        this.disposables.push(
            this.contextMixer,
            this.renderer,
            // Command is used to manually debug the autoedits provider
            vscode.commands.registerCommand('cody.experimental.suggest', () => {
                const document = vscode.window.activeTextEditor!.document
                const position = vscode.window.activeTextEditor!.selection.active
                this.provideInlineCompletionItems(document, position, {
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
        token?.onCancellationRequested(() => {
            controller.abort()
        })
        await new Promise(resolve => setTimeout(resolve, this.debounceIntervalMs))
        return this.doProvideInlineCompletionItems(document, position, controller.signal)
    }

    public async doProvideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        abortSignal: AbortSignal
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {
        if (abortSignal.aborted) {
            return null
        }
        // Generate the prediction and if the prediction is similar to only autocomplete request
        // use the inline completions, otherwise use custom decorations
        const autoeditResponse = await this.predictAutoeditAtDocAndPosition({
            document,
            position,
            abortSignal,
        })
        if (abortSignal.aborted || autoeditResponse === null) {
            return null
        }

        const isPrefixMatch = autoeditResponse.prediction.startsWith(
            autoeditResponse.codeToReplaceData.codeToRewritePrefix
        )
        const isSuffixMatch = autoeditResponse.prediction.endsWith(
            autoeditResponse.codeToReplaceData.codeToRewriteSuffix
        )
        const inlineDebugData = {
            isPrefixMatch,
            isSuffixMatch,
            prediction: JSON.stringify(autoeditResponse.prediction),
            codeToRewritePrefix: JSON.stringify(autoeditResponse.codeToReplaceData.codeToRewritePrefix),
            codeToRewriteSuffix: JSON.stringify(autoeditResponse.codeToReplaceData.codeToRewriteSuffix),
        }
        this.logDebug(
            'AutoEdits',
            'Inline Completions Data Debug:\n',
            JSON.stringify(inlineDebugData, null, 2)
        )
        if (isPrefixMatch && isSuffixMatch) {
            const autocompleteResponse = this.extractInlineCompletion(autoeditResponse)
            return [new vscode.InlineCompletionItem(autocompleteResponse)]
        }
        await this.renderer.render(
            {
                document,
                position,
            },
            autoeditResponse.codeToReplaceData,
            autoeditResponse.prediction
        )
        return null
    }

    private extractInlineCompletion(autoeditResponse: AutoeditsPrediction): string {
        let startIndex = 0
        let endIndex = autoeditResponse.prediction.length

        if (autoeditResponse.codeToReplaceData.codeToRewritePrefix) {
            startIndex = autoeditResponse.codeToReplaceData.codeToRewritePrefix.length
        }

        if (autoeditResponse.codeToReplaceData.codeToRewriteSuffix) {
            endIndex =
                autoeditResponse.prediction.length -
                autoeditResponse.codeToReplaceData.codeToRewriteSuffix.length
        }

        const autocompleteResponse = autoeditResponse.prediction.slice(startIndex, endIndex)
        return autocompleteResponse
    }

    private initizlizePromptProvider(provider: string) {
        if (provider === 'openai') {
            this.provider = new OpenAIPromptProvider()
        } else if (provider === 'deepseek') {
            this.provider = new DeepSeekPromptProvider()
        } else if (provider === 'fireworks') {
            this.provider = new FireworksPromptProvider()
        } else {
            this.logDebug('AutoEdits', `provider ${provider} not supported`)
        }
    }

    private logDebug(provider: string, ...args: unknown[]): void {
        this.outputChannel.appendLine(`${provider} █| ${args.join('')}`)
    }

    public async predictAutoeditAtDocAndPosition(
        options: AutoEditsProviderOptions
    ): Promise<AutoeditsPrediction | null> {
        if (!this.provider || !this.autoEditsTokenLimit || !this.model || !this.apiKey) {
            this.logDebug('AutoEdits', 'No Provider or Token Limit found in the settings')
            return null
        }
        const start = Date.now()
        const docContext = this.getDocContext(options.document, options.position)
        const { context } = await this.contextMixer.getContext({
            document: options.document,
            position: options.position,
            docContext: docContext,
            maxChars: 100000,
        })
        const { codeToReplace, promptResponse: prompt } = this.provider.getPrompt(
            docContext,
            options.document,
            options.position,
            context,
            this.autoEditsTokenLimit
        )
        if (options.abortSignal?.aborted) {
            return null
        }

        const response = await this.provider.getModelResponse(this.model, this.apiKey, prompt)
        const postProcessedResponse = this.provider.postProcessResponse(codeToReplace, response)
        this.logDebug(
            'Autoedits',
            '========================== Response:\n',
            JSON.stringify(postProcessedResponse),
            '\n'
        )
        const timeToResponse = Date.now() - start
        this.logDebug(
            'Autoedits',
            '========================== Time Taken For LLM (Msec): ',
            timeToResponse.toString(),
            '\n'
        )
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

    public dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
