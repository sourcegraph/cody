import {
    type AutoEditsTokenLimit,
    type DocumentContext,
    displayPath,
    logDebug,
} from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'
import { createGitDiff } from '../../../lib/shared/src/editor/create-git-diff'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { getCurrentDocContext } from '../completions/get-current-doc-context'
import { getConfiguration } from '../configuration'
import { DeepSeekPromptProvider, OpenAIPromptProvider, type PromptProvider } from './prompt-provider'
import type { CodeToReplaceData } from './prompt-utils'

const AUTOEDITS_CONTEXT_STRATEGY = 'auto-edits'

export interface AutoEditsProviderOptions {
    document: vscode.TextDocument
    position: vscode.Position
}

export class AutoeditsProvider implements vscode.Disposable, vscode.HoverProvider {
    private disposables: vscode.Disposable[] = []
    private contextMixer: ContextMixer = new ContextMixer(
        new DefaultContextStrategyFactory(Observable.of(AUTOEDITS_CONTEXT_STRATEGY)),
        false
    )
    private autoEditsTokenLimit: AutoEditsTokenLimit | undefined
    private provider: PromptProvider | undefined
    private model: string | undefined
    private apiKey: string | undefined

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
            vscode.commands.registerCommand('cody.command.auto-edits-at-cursor', () =>
                this.getAutoedit()
            ),
            vscode.languages.registerHoverProvider({ scheme: 'file' }, this)
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
        this.showSuggestion(options, codeToReplace, response, timeToResponse)
    }

    private showSuggestion(
        options: AutoEditsProviderOptions,
        codeToReplace: CodeToReplaceData,
        predictedText: string,
        timeToResponse: number
    ) {
        const prevSuffixLine = codeToReplace.endLine - 1
        const range = new vscode.Range(
            codeToReplace.startLine,
            0,
            prevSuffixLine,
            options.document.lineAt(prevSuffixLine).range.end.character
        )
        const currentText = options.document.getText(range)
        logDebug('AutoEdits: (Time LLM Query):', timeToResponse.toString())

        // Show the decoration
        const diff = this.getDiff(options.document.uri, currentText, predictedText)

        // Register the hover provider for this specific range
        const hoverDisposable = vscode.languages.registerHoverProvider(
            { scheme: 'file' },
            {
                provideHover: (document, position, token) => {
                    if (range.contains(position)) {
                        return this.provideHover(document, position, token, diff)
                    }
                    return null
                },
            }
        )

        this.disposables.push(
            hoverDisposable,
            vscode.workspace.onDidChangeTextDocument(e => {
                if (e.document === options.document) {
                    hoverDisposable.dispose()
                }
            })
        )

        // Automatically show the hover
        vscode.commands.executeCommand('editor.action.showHover')
    }

    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        diff?: string
    ): vscode.ProviderResult<vscode.Hover> {
        if (diff) {
            const displayDiff = diff.replace('\\ No newline at end of file', '').trim()
            const markdown = new vscode.MarkdownString()
            markdown.appendText('✨ Cody Auto Edits ✨\n')
            markdown.appendCodeblock(displayDiff, 'diff')
            return new vscode.Hover(markdown)
        }
        return null
    }

    private getDiff(uri: vscode.Uri, codeToRewrite: string, prediction: string) {
        const diff = createGitDiff(displayPath(uri), codeToRewrite, prediction)
        logDebug('AutoEdits (Diff@ Cursor Position)\n', diff)
        return diff
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
