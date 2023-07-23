import path from 'path'

import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'

import { debug } from '../log'
import { CodyStatusBar } from '../services/StatusBar'

import { CachedCompletions, CompletionsCache } from './cache'
import { getContext } from './context'
import { getCurrentDocContext } from './document'
import { History } from './history'
import * as CompletionLogger from './logger'
import { detectMultiline } from './multiline'
import { Provider, ProviderConfig } from './providers/provider'
import { RequestManager } from './request-manager'
import { sharedPostProcess } from './shared-post-process'
import { isAbortError, SNIPPET_WINDOW_SIZE } from './utils'

interface CodyCompletionItemProviderConfig {
    providerConfig: ProviderConfig
    history: History
    statusBar: CodyStatusBar
    codebaseContext: CodebaseContext
    responsePercentage?: number
    prefixPercentage?: number
    suffixPercentage?: number
    disableTimeouts?: boolean
    isEmbeddingsContextEnabled?: boolean
    triggerMoreEagerly: boolean
    cache: CompletionsCache | null
    completeSuggestWidgetSelection?: boolean
}

export class CodyCompletionItemProvider implements vscode.InlineCompletionItemProvider {
    private promptChars: number
    private maxPrefixChars: number
    private maxSuffixChars: number
    private abortOpenCompletions: () => void = () => {}
    private stopLoading: () => void = () => {}
    private lastContentChanges: LRUCache<string, 'add' | 'del'> = new LRUCache<string, 'add' | 'del'>({
        max: 10,
    })

    private readonly config: Required<CodyCompletionItemProviderConfig>

    private requestManager: RequestManager

    constructor({
        responsePercentage = 0.1,
        prefixPercentage = 0.6,
        suffixPercentage = 0.1,
        disableTimeouts = false,
        isEmbeddingsContextEnabled = true,
        completeSuggestWidgetSelection = false,
        ...config
    }: CodyCompletionItemProviderConfig) {
        this.config = {
            ...config,
            responsePercentage,
            prefixPercentage,
            suffixPercentage,
            disableTimeouts,
            isEmbeddingsContextEnabled,
            completeSuggestWidgetSelection,
        }

        if (this.config.completeSuggestWidgetSelection) {
            // This must be set to true, or else the suggest widget showing will suppress inline
            // completions. Note that the VS Code proposed API inlineCompletionsAdditions contains
            // an InlineCompletionList#suppressSuggestions field that lets an inline completion
            // provider override this on a per-completion basis. Because that API is proposed, we
            // can't use it and must instead resort to writing to the user's VS Code settings.
            //
            // The cody.autocomplete.experimental.completeSuggestWidgetSelection setting is
            // experimental and off by default. Before turning it on by default, we need to try to
            // find a workaround that is not silently updating the user's VS Code settings.
            void vscode.workspace
                .getConfiguration()
                .update('editor.inlineSuggest.suppressSuggestions', true, vscode.ConfigurationTarget.Global)
        }

        this.promptChars =
            this.config.providerConfig.maximumContextCharacters -
            this.config.providerConfig.maximumContextCharacters * responsePercentage
        this.maxPrefixChars = Math.floor(this.promptChars * this.config.prefixPercentage)
        this.maxSuffixChars = Math.floor(this.promptChars * this.config.suffixPercentage)

        this.requestManager = new RequestManager(this.config.cache)

        debug('CodyCompletionProvider:initialized', `provider: ${this.config.providerConfig.identifier}`)

        vscode.workspace.onDidChangeTextDocument(event => {
            const document = event.document
            const changes = event.contentChanges

            if (changes.length <= 0) {
                return
            }

            const text = changes[0].text
            this.lastContentChanges.set(document.fileName, text.length > 0 ? 'add' : 'del')
        })
    }

    public async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        // Making it optional here to execute multiple suggestion in parallel from the CLI script.
        token?: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList> {
        try {
            return await this.provideInlineCompletionItemsInner(document, position, context, token)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            this.stopLoading()

            if (isAbortError(error)) {
                return { items: [] }
            }

            console.error(error)
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            debug('CodyCompletionProvider:inline:error', `${error.toString()}\n${error.stack}`)
            return { items: [] }
        }
    }

    private async provideInlineCompletionItemsInner(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token?: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList> {
        const abortController = new AbortController()
        if (token) {
            this.abortOpenCompletions()
            token.onCancellationRequested(() => abortController.abort())
            this.abortOpenCompletions = () => abortController.abort()
        }

        CompletionLogger.clear()

        if (!vscode.window.activeTextEditor || document.uri.scheme === 'cody') {
            return { items: [] }
        }

        const docContext = getCurrentDocContext(document, position, this.maxPrefixChars, this.maxSuffixChars)
        if (!docContext) {
            return { items: [] }
        }

        const { prefix, suffix, prevNonEmptyLine } = docContext

        // Text before the cursor on the same line.
        const sameLinePrefix = docContext.prevLine

        // Text after the cursor on the same line.
        const sameLineSuffix = suffix.slice(0, suffix.indexOf('\n'))

        const multiline = detectMultiline(
            prefix,
            prevNonEmptyLine,
            sameLinePrefix,
            sameLineSuffix,
            document.languageId,
            this.config.providerConfig.enableExtendedMultilineTriggers
        )

        // Avoid showing completions when we're deleting code (Cody can only insert code at the
        // moment)
        const lastChange = this.lastContentChanges.get(document.fileName) ?? 'add'
        if (lastChange === 'del') {
            // When a line was deleted, only look up cached items and only include them if the
            // untruncated prefix matches. This fixes some weird issues where the completion would
            // render if you insert whitespace but not on the original place when you delete it
            // again
            const cachedCompletions = this.config.cache?.get(prefix, false)
            if (cachedCompletions?.isExactPrefix) {
                return handleCacheHit(
                    cachedCompletions,
                    document,
                    position,
                    prefix,
                    suffix,
                    multiline,
                    document.languageId
                )
            }
            return { items: [] }
        }

        const cachedCompletions = this.config.cache?.get(prefix)
        if (cachedCompletions) {
            return handleCacheHit(cachedCompletions, document, position, prefix, suffix, multiline, document.languageId)
        }

        const completers: Provider[] = []
        let timeout: number

        // Don't show completions if we are in the process of writing a word.
        const cursorAtWord = /\w$/.test(sameLinePrefix)
        if (cursorAtWord && !this.config.triggerMoreEagerly) {
            return { items: [] }
        }
        const triggeredMoreEagerly = this.config.triggerMoreEagerly && cursorAtWord

        let triggeredForSuggestWidgetSelection: string | undefined
        if (context.selectedCompletionInfo) {
            if (this.config.completeSuggestWidgetSelection) {
                triggeredForSuggestWidgetSelection = context.selectedCompletionInfo.text
            } else {
                // Don't show completions if the suggest widget (which shows language autocomplete)
                // is showing.
                return { items: [] }
            }
        }

        // If we have a suffix in the same line as the cursor and the suffix contains any word
        // characters, do not attempt to make a completion. This means we only make completions if
        // we have a suffix in the same line for special characters like `)]}` etc.
        //
        // VS Code will attempt to merge the remainder of the current line by characters but for
        // words this will easily get very confusing.
        if (/\w/.test(sameLineSuffix)) {
            return { items: [] }
        }

        const sharedProviderOptions = {
            prefix,
            suffix,
            fileName: path.normalize(vscode.workspace.asRelativePath(document.fileName ?? '')),
            languageId: document.languageId,
            responsePercentage: this.config.responsePercentage,
            prefixPercentage: this.config.prefixPercentage,
            suffixPercentage: this.config.suffixPercentage,
        }

        if (multiline) {
            timeout = 100
            completers.push(
                this.config.providerConfig.create({
                    id: 'multiline',
                    ...sharedProviderOptions,
                    n: 3, // 3 vs. 1 does not meaningfully affect perf
                    multiline: true,
                })
            )
        } else {
            if (cursorAtWord) {
                // The cursor is at a word and the user might still be typing it, so wait for longer.
                timeout = 200
            } else {
                // The current line has a suffix.
                timeout = 20
            }
            completers.push(
                this.config.providerConfig.create({
                    id: 'single-line-suffix',
                    ...sharedProviderOptions,
                    n: 1, // 1 vs. 3 improves perf
                    multiline: false,
                })
            )
        }

        if (!this.config.disableTimeouts && context.triggerKind !== vscode.InlineCompletionTriggerKind.Invoke) {
            await new Promise<void>(resolve => setTimeout(resolve, timeout))
        }

        // We don't need to make a request at all if the signal is already aborted after the
        // debounce
        if (abortController.signal.aborted) {
            return { items: [] }
        }

        const { context: similarCode, logSummary: contextSummary } = await getContext({
            document,
            prefix,
            suffix,
            history: this.config.history,
            jaccardDistanceWindowSize: SNIPPET_WINDOW_SIZE,
            maxChars: this.promptChars,
            codebaseContext: this.config.codebaseContext,
            isEmbeddingsContextEnabled: this.config.isEmbeddingsContextEnabled,
        })
        if (abortController.signal.aborted) {
            return { items: [] }
        }

        const logId = CompletionLogger.start({
            type: 'inline',
            multiline,
            providerIdentifier: this.config.providerConfig.identifier,
            languageId: document.languageId,
            contextSummary,
            triggeredMoreEagerly,
            triggeredForSuggestWidgetSelection: triggeredForSuggestWidgetSelection !== undefined,
            settings: {
                autocompleteExperimentalTriggerMoreEagerly: this.config.triggerMoreEagerly,
                autocompleteExperimentalCompleteSuggestWidgetSelection: Boolean(
                    this.config.completeSuggestWidgetSelection
                ),
            },
        })
        const stopLoading = this.config.statusBar.startLoading('Completions are being generated')
        this.stopLoading = stopLoading

        // Overwrite the abort handler to also update the loading state
        const previousAbort = this.abortOpenCompletions
        this.abortOpenCompletions = () => {
            previousAbort()
            stopLoading()
        }

        const completions = await this.requestManager.request(
            document.uri.toString(),
            logId,
            prefix,
            completers,
            similarCode,
            abortController.signal
        )

        // Shared post-processing logic
        const processedCompletions = processCompletions(completions, prefix, suffix, multiline, document.languageId)
        stopLoading()

        if (processedCompletions.length > 0) {
            CompletionLogger.suggest(logId)
            return toInlineCompletionItems(logId, document, position, processedCompletions)
        }

        CompletionLogger.noResponse(logId)
        return { items: [] }
    }
}

export interface Completion {
    prefix: string
    content: string
    stopReason?: string
}

function handleCacheHit(
    cachedCompletions: CachedCompletions,
    document: vscode.TextDocument,
    position: vscode.Position,
    prefix: string,
    suffix: string,
    multiline: boolean,
    languageId: string
): vscode.InlineCompletionList {
    const results = processCompletions(cachedCompletions.completions, prefix, suffix, multiline, languageId)
    return toInlineCompletionItems(cachedCompletions.logId, document, position, results)
}

function processCompletions(
    completions: Completion[],
    prefix: string,
    suffix: string,
    multiline: boolean,
    languageId: string
): Completion[] {
    // Shared post-processing logic
    const processedCompletions = completions.map(completion =>
        sharedPostProcess({ prefix, suffix, multiline, languageId, completion })
    )

    // Filter results
    const visibleResults = filterCompletions(processedCompletions)

    // Remove duplicate results
    const uniqueResults = [...new Map(visibleResults.map(c => [c.content, c])).values()]

    // Rank results
    const rankedResults = rankCompletions(uniqueResults)

    return rankedResults
}

function toInlineCompletionItems(
    logId: string,
    document: vscode.TextDocument,
    position: vscode.Position,
    completions: Completion[]
): vscode.InlineCompletionList {
    return {
        items: completions.map(completion => {
            const lines = completion.content.split(/\r\n|\r|\n/).length
            const currentLineText = document.lineAt(position)
            const endOfLine = currentLineText.range.end
            return new vscode.InlineCompletionItem(completion.content, new vscode.Range(position, endOfLine), {
                title: 'Completion accepted',
                command: 'cody.autocomplete.inline.accepted',
                arguments: [{ codyLogId: logId, codyLines: lines }],
            })
        }),
    }
}

function rankCompletions(completions: Completion[]): Completion[] {
    // TODO(philipp-spiess): Improve ranking to something more complex then just length
    return completions.sort((a, b) => b.content.split('\n').length - a.content.split('\n').length)
}

function filterCompletions(completions: Completion[]): Completion[] {
    return completions.filter(c => c.content.trim() !== '')
}
