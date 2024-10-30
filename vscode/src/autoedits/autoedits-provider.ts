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
                this.getAutoedit()
            })
        )
    }

    public async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token?: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {
        // Generate the prediction and if the prediction is similar to only autocomplete request
        // use the inline completions, otherwise use custom decorations
        const autoeditResponse = await this.predictAutoeditAtDocAndPosition({
            document,
            position,
        })
        if (autoeditResponse === null) {
            return null
        }
        // Check if the prediction is similar to only autocomplete request
        if (
            autoeditResponse.prediction.startsWith(
                autoeditResponse.codeToReplaceData.codeToRewritePrefix
            ) &&
            autoeditResponse.prediction.endsWith(autoeditResponse.codeToReplaceData.codeToRewriteSuffix)
        ) {
            this.logDebug('AutoEdits', '======= Using Inline Decorations =======')
            const autocompleteResponse = this.extractInlineCompletion(autoeditResponse)
            return [new vscode.InlineCompletionItem(autocompleteResponse)]
        }
        this.logDebug('AutoEdits', '======= Using Custom Decorations =======')
        await this.renderer.render(
            {
                document,
                position,
            },
            autoeditResponse.codeToReplaceData,
            autoeditResponse.prediction
        )
        // Return null for inline completions and use custom decorations
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

    public async getAutoedit() {
        const document = vscode.window.activeTextEditor!.document
        const position = vscode.window.activeTextEditor!.selection.active
        const autoeditResponse = await this.predictAutoeditAtDocAndPosition({
            document,
            position,
        })
        if (autoeditResponse) {
            await this.renderer.render(
                {
                    document,
                    position,
                },
                autoeditResponse.codeToReplaceData,
                autoeditResponse.prediction
            )
        }
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
        const response = await this.provider.getModelResponse(this.model, this.apiKey, prompt)
        const postProcessedResponse = this.provider.postProcessResponse(codeToReplace, response)
        this.logDebug('Autoedits', '========================== Response:\n', postProcessedResponse, '\n')
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
