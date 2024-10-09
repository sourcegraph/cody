import { type DocumentContext, displayPath, logDebug } from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import * as vscode from 'vscode'
import { createGitDiff } from '../../../lib/shared/src/editor/create-git-diff'
import { ContextMixer } from '../completions/context/context-mixer'
import { DefaultContextStrategyFactory } from '../completions/context/context-strategy'
import { RetrieverIdentifier } from '../completions/context/utils'
import { getCurrentDocContext } from '../completions/get-current-doc-context'
import { getOpenAIChatCompletion } from './model-helpers'
import { OpenAIPromptProvider, type PromptProvider } from './prompt-provider'
import type { CodeToReplaceData } from './prompt-utils'

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

export class AutoeditsProvider implements vscode.Disposable, vscode.HoverProvider {
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
            ),
            vscode.languages.registerHoverProvider({ scheme: 'file' }, this)
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
        const { codeToReplace, promptResponse: prompt } = this.provider.getPrompt(
            docContext,
            options.document,
            context,
            this.autoEditsTokenLimit
        )
        if (Array.isArray(prompt)) {
            const response = await getOpenAIChatCompletion(prompt)
            this.showSuggestion(options, codeToReplace, response)
        }
    }

    private showSuggestion(
        options: AutoEditsProviderOptions,
        codeToReplace: CodeToReplaceData,
        predictedText: string
    ) {
        const prevSuffixLine = codeToReplace.endLine - 1
        const range = new vscode.Range(
            codeToReplace.startLine,
            0,
            prevSuffixLine,
            options.document.lineAt(prevSuffixLine).range.end.character
        )
        const currentText = options.document.getText(range)
        const originalText = codeToReplace.codeToRewrite.toString()

        logDebug('AutoEdits (originalText)\n', originalText)

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
