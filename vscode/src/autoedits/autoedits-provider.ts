import { type AutoEditsTokenLimit, type DocumentContext, logDebug } from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { getCurrentDocContext } from '../completions/get-current-doc-context'
import { getConfiguration } from '../configuration'
import { DeepSeekPromptProvider, OpenAIPromptProvider, type PromptProvider } from './prompt-provider'
import { AutoEditsRenderer } from './renderer'

const AUTOEDITS_CONTEXT_STRATEGY = 'auto-edits'

export interface AutoEditsProviderOptions {
    document: vscode.TextDocument
    position: vscode.Position
}

export class AutoeditsProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private contextMixer: ContextMixer = new ContextMixer(
        new DefaultContextStrategyFactory(Observable.of(AUTOEDITS_CONTEXT_STRATEGY)),
        false
    )
    private autoEditsTokenLimit: AutoEditsTokenLimit | undefined
    private provider: PromptProvider | undefined
    private model: string | undefined
    private apiKey: string | undefined
    private renderer: AutoEditsRenderer = new AutoEditsRenderer()

    constructor() {
        const config = getConfiguration().experimentalAutoedits
        if (config === undefined) {
            logDebug('AutoEdits', 'No Configuration found in the settings')
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

    private initizlizePromptProvider(provider: string) {
        if (provider === 'openai') {
            this.provider = new OpenAIPromptProvider()
        } else if (provider === 'deepseek') {
            this.provider = new DeepSeekPromptProvider()
        } else {
            logDebug('AutoEdits', `provider ${provider} not supported`)
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
            logDebug('AutoEdits', 'No Provider or Token Limit found in the settings')
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
        const timeToResponse = Date.now() - start
        logDebug('AutoEdits: (Time LLM Query):', timeToResponse.toString())
        await this.renderer.render(options, codeToReplace, response)
    }

    private getDocContext(document: vscode.TextDocument, position: vscode.Position): DocumentContext {
        return getCurrentDocContext({
            document,
            position,
            maxPrefixLength: convertTokensToChars(this.autoEditsTokenLimit?.prefixTokens ?? 0),
            maxSuffixLength: convertTokensToChars(this.autoEditsTokenLimit?.suffixTokens ?? 0),
        })
    }

    public dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}

function convertTokensToChars(tokens: number) {
    return tokens * 4
}
