import { type AutoEditsTokenLimit, type DocumentContext, tokensToChars } from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { getCurrentDocContext } from '../completions/get-current-doc-context'
import { getConfiguration } from '../configuration'
import type { PromptProvider } from './prompt-provider'
import { DeepSeekPromptProvider } from './providers/deepseek'
import { FireworksPromptProvider } from './providers/fireworks'
import { OpenAIPromptProvider } from './providers/openai'
import { AutoEditsRenderer } from './renderer'

const AUTOEDITS_CONTEXT_STRATEGY = 'auto-edits'

export interface AutoEditsProviderOptions {
    document: vscode.TextDocument
    position: vscode.Position
}

export class AutoeditsProvider implements vscode.Disposable {
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
            vscode.commands.registerCommand('cody.experimental.suggest', () => this.getAutoedit())
        )
    }
    private logDebug(provider: string, ...args: unknown[]): void {
        this.outputChannel.appendLine(`${provider} █| ${args.join('')}`)
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

    public getAutoedit() {
        this.predictAutoeditAtDocAndPosition({
            document: vscode.window.activeTextEditor!.document,
            position: vscode.window.activeTextEditor!.selection.active,
        })
    }

    public async predictAutoeditAtDocAndPosition(options: AutoEditsProviderOptions) {
        if (!this.provider || !this.autoEditsTokenLimit || !this.model || !this.apiKey) {
            this.logDebug('AutoEdits', 'No Provider or Token Limit found in the settings')
            return
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
        await this.renderer.render(options, codeToReplace, postProcessedResponse)
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
