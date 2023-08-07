import * as vscode from 'vscode'

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'

import { debug } from '../log'
import { CodyStatusBar } from '../services/StatusBar'

import { getContext, GetContextOptions, GetContextResult } from './context'
import {
    getInlineCompletions,
    InlineCompletionsParams,
    InlineCompletionsResultSource,
    LastInlineCompletionCandidate,
} from './getInlineCompletions'
import { DocumentHistory } from './history'
import { ProviderConfig } from './providers/provider'
import { RequestManager } from './request-manager'
import {
    ProvideInlineCompletionItemsTracer,
    ProvideInlineCompletionsItemTraceData,
    SetProviderInlineCompletionItemsTracer,
} from './tracer'
import { InlineCompletionItem } from './types'
import { getNextNonEmptyLine } from './utils/text-utils'

interface CodyCompletionItemProviderConfig {
    providerConfig: ProviderConfig
    history: DocumentHistory
    statusBar: CodyStatusBar
    getCodebaseContext: () => CodebaseContext
    responsePercentage?: number
    prefixPercentage?: number
    suffixPercentage?: number
    isEmbeddingsContextEnabled?: boolean
    completeSuggestWidgetSelection?: boolean
    tracer?: ProvideInlineCompletionItemsTracer | null
    contextFetcher?: (options: GetContextOptions) => Promise<GetContextResult>
}

export class InlineCompletionItemProvider
    implements vscode.InlineCompletionItemProvider, SetProviderInlineCompletionItemsTracer
{
    private promptChars: number
    private maxPrefixChars: number
    private maxSuffixChars: number
    private abortOpenCompletions: () => void = () => {}

    private readonly config: Required<CodyCompletionItemProviderConfig>

    private requestManager: RequestManager

    /** Mockable (for testing only). */
    protected getInlineCompletions = getInlineCompletions

    /** Accessible for testing only. */
    protected lastCandidate: LastInlineCompletionCandidate | undefined

    constructor({
        responsePercentage = 0.1,
        prefixPercentage = 0.6,
        suffixPercentage = 0.1,
        isEmbeddingsContextEnabled = true,
        completeSuggestWidgetSelection = false,
        tracer = null,
        ...config
    }: CodyCompletionItemProviderConfig) {
        this.config = {
            ...config,
            responsePercentage,
            prefixPercentage,
            suffixPercentage,
            isEmbeddingsContextEnabled,
            completeSuggestWidgetSelection,
            tracer,
            contextFetcher: config.contextFetcher ?? getContext,
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

        this.requestManager = new RequestManager()

        debug('CodyCompletionProvider:initialized', `provider: ${this.config.providerConfig.identifier}`)
    }

    /** Set the tracer (or unset it with `null`). */
    public setTracer(value: ProvideInlineCompletionItemsTracer | null): void {
        this.config.tracer = value
    }

    public async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        // Making it optional here to execute multiple suggestion in parallel from the CLI script.
        token?: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList> {
        const tracer = this.config.tracer ? createTracerForInvocation(this.config.tracer) : undefined

        let stopLoading: () => void | undefined
        const setIsLoading = (isLoading: boolean): void => {
            if (isLoading) {
                stopLoading = this.config.statusBar.startLoading('Completions are being generated')
            } else {
                stopLoading?.()
            }
        }

        const abortController = new AbortController()
        this.abortOpenCompletions()
        if (token) {
            if (token.isCancellationRequested) {
                abortController.abort()
            }
            token.onCancellationRequested(() => abortController.abort())
            this.abortOpenCompletions = () => abortController.abort()
        }

        const result = await this.getInlineCompletions({
            document,
            position,
            context,
            promptChars: this.promptChars,
            maxPrefixChars: this.maxPrefixChars,
            maxSuffixChars: this.maxSuffixChars,
            providerConfig: this.config.providerConfig,
            responsePercentage: this.config.responsePercentage,
            prefixPercentage: this.config.prefixPercentage,
            suffixPercentage: this.config.suffixPercentage,
            isEmbeddingsContextEnabled: this.config.isEmbeddingsContextEnabled,
            toWorkspaceRelativePath: uri => vscode.workspace.asRelativePath(uri),
            contextFetcher: this.config.contextFetcher,
            getCodebaseContext: this.config.getCodebaseContext,
            documentHistory: this.config.history,
            requestManager: this.requestManager,
            lastCandidate: this.lastCandidate,
            debounceInterval: { singleLine: 25, multiLine: 125 },
            setIsLoading,
            abortSignal: abortController.signal,
            tracer,
        })

        // Track the last candidate completion (that is shown as ghost text in the editor) so that
        // we can reuse it if the user types in such a way that it is still valid (such as by typing
        // `ab` if the ghost text suggests `abcd`).
        if (result && result.source !== InlineCompletionsResultSource.LastCandidate) {
            this.lastCandidate =
                result?.items.length > 0
                    ? {
                          uri: document.uri,
                          lastTriggerPosition: position,
                          lastTriggerCurrentLinePrefix: document.lineAt(position).text.slice(0, position.character),
                          lastTriggerNextNonEmptyLine: getNextNonEmptyLine(
                              document.getText(
                                  new vscode.Range(position, document.lineAt(document.lineCount - 1).range.end)
                              )
                          ),
                          result: {
                              logId: result.logId,
                              items: result.items,
                          },
                      }
                    : undefined
        }

        return {
            items: result ? this.processInlineCompletionsForVSCode(result.logId, document, position, result.items) : [],
        }
    }

    /**
     * Process completions items in VS Code-specific ways.
     */
    private processInlineCompletionsForVSCode(
        logId: string,
        document: vscode.TextDocument,
        position: vscode.Position,
        items: InlineCompletionItem[]
    ): vscode.InlineCompletionItem[] {
        return items.map(completion => {
            const currentLine = document.lineAt(position)
            const currentLinePrefix = document.getText(currentLine.range.with({ end: position }))

            // Return the completion from the start of the current line (instead of starting at the
            // given position). This avoids UI jitter in VS Code; when typing or deleting individual
            // characters, VS Code reuses the existing completion while it waits for the new one to
            // come in.
            const start = currentLine.range.start

            // Limit the range to the current position if the model supports infilling and the
            // response only has a single line.
            // For non FIM models, the same line suffix will be repeated in the completion
            const supportsInfilling = this.config.providerConfig.supportsInfilling
            const isMultiline = completion.insertText.includes('\n')
            const end = supportsInfilling && !isMultiline ? position : currentLine.range.end

            return new vscode.InlineCompletionItem(
                currentLinePrefix + completion.insertText,
                new vscode.Range(start, end),
                {
                    title: 'Completion accepted',
                    command: 'cody.autocomplete.inline.accepted',
                    arguments: [{ codyLogId: logId, codyLines: completion.insertText.split(/\r\n|\r|\n/).length }],
                }
            )
        })
    }
}

let globalInvocationSequenceForTracer = 0

/**
 * Creates a tracer for a single invocation of
 * {@link CodyCompletionItemProvider.provideInlineCompletionItems} that accumulates all of the data
 * for that invocation.
 */
function createTracerForInvocation(tracer: ProvideInlineCompletionItemsTracer): InlineCompletionsParams['tracer'] {
    let data: ProvideInlineCompletionsItemTraceData = { invocationSequence: ++globalInvocationSequenceForTracer }
    return (update: Partial<ProvideInlineCompletionsItemTraceData>) => {
        data = { ...data, ...update }
        tracer(data)
    }
}
