import { type DocumentContext, logDebug } from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { RetrieverIdentifier } from '../completions/context/utils'
import { getCurrentDocContext } from '../completions/get-current-doc-context'
import { getOpenAIChatCompletion } from './model-helpers'
import { OpenAIPromptProvider, type PromptProvider } from './prompt-provider'

const AUTOEDITS_CONTEXT_STRATEGY = 'auto-edits'

export interface AutoEditsProviderOptions {
    document: vscode.TextDocument
    position: vscode.Position
}

export interface AutoEditsTokenLimit {
    prefixTokens: number
    suffixTokens: number
    maxPrefixLinesInArea: number
    maxSuffixLinesInArea: number
    codeToRewritePrefixLines: number
    codeToRewriteSuffixLines: number
    contextSpecificTokenLimit: Map<RetrieverIdentifier, number>
}

export class AutoeditsProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private contextMixer: ContextMixer = new ContextMixer(
        new DefaultContextStrategyFactory(Observable.of(AUTOEDITS_CONTEXT_STRATEGY)),
        false
    )
    private provider: PromptProvider = new OpenAIPromptProvider()

    // Values based on the offline experiment.
    private autoEditsTokenLimit: AutoEditsTokenLimit = {
        prefixTokens: 3_000,
        suffixTokens: 3_000,
        maxPrefixLinesInArea: 12,
        maxSuffixLinesInArea: 5,
        codeToRewritePrefixLines: 2,
        codeToRewriteSuffixLines: 3,
        contextSpecificTokenLimit: new Map([
            [RetrieverIdentifier.RecentEditsRetriever, 2_500],
            [RetrieverIdentifier.JaccardSimilarityRetriever, 3_000],
            [RetrieverIdentifier.RecentCopyRetriever, 1_000],
            [RetrieverIdentifier.DiagnosticsRetriever, 1_000],
            [RetrieverIdentifier.RecentViewPortRetriever, 3_000],
        ]),
    }

    constructor() {
        this.disposables.push(
            this.contextMixer,
            vscode.commands.registerCommand('cody.command.auto-diff-at-position', () =>
                this.getAutoedit()
            )
        )
    }

    public getAutoedit() {
        this.predictAutoeditAtDocAndPosition({
            document: vscode.window.activeTextEditor!.document,
            position: vscode.window.activeTextEditor!.selection.active,
        })
    }

    public async predictAutoeditAtDocAndPosition(options: AutoEditsProviderOptions) {
        const docContext = this.getDocContext(options.document, options.position)
        const { context } = await this.contextMixer.getContext({
            document: options.document,
            position: options.position,
            docContext: docContext,
            maxChars: 100000,
        })
        const prompt = this.provider.getPrompt(
            docContext,
            options.document,
            context,
            this.autoEditsTokenLimit
        )
        if (Array.isArray(prompt)) {
            const response = await getOpenAIChatCompletion(prompt)
            logDebug('AutoEdits:\n', response)
        }
    }

    private getDocContext(document: vscode.TextDocument, position: vscode.Position): DocumentContext {
        return getCurrentDocContext({
            document,
            position,
            maxPrefixLength: convertTokensToChars(this.autoEditsTokenLimit.prefixTokens),
            maxSuffixLength: convertTokensToChars(this.autoEditsTokenLimit.suffixTokens),
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
