import * as vscode from 'vscode'

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'

import { debug } from '../log'
import { CodyStatusBar } from '../services/StatusBar'

import { getContext, GetContextOptions, GetContextResult } from './context/context'
import { DocumentHistory } from './context/history'
import { DocumentContext, getCurrentDocContext } from './document'
import {
    getInlineCompletions,
    InlineCompletionsParams,
    InlineCompletionsResultSource,
    LastInlineCompletionCandidate,
} from './getInlineCompletions'
import * as CompletionLogger from './logger'
import { ProviderConfig } from './providers/provider'
import { RequestManager } from './request-manager'
import { ProvideInlineCompletionItemsTracer, ProvideInlineCompletionsItemTraceData } from './tracer'
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

export class InlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {
    private promptChars: number
    private maxPrefixChars: number
    private maxSuffixChars: number

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

        this.requestManager = new RequestManager({
            completeSuggestWidgetSelection: this.config.completeSuggestWidgetSelection,
        })

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
    ): Promise<vscode.InlineCompletionList | null> {
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
        if (token) {
            if (token.isCancellationRequested) {
                abortController.abort()
            }
            token.onCancellationRequested(() => abortController.abort())
        }

        // When the user has the completions popup open and an item is selected that does not match
        // the text that is already in the editor, VS Code will never render the completion.
        if (!currentEditorContentMatchesPopupItem(document, context)) {
            return null
        }

        const docContext = getCurrentDocContext(document, position, this.maxPrefixChars, this.maxSuffixChars, context)

        const result = await this.getInlineCompletions({
            document,
            position,
            context,
            docContext,
            promptChars: this.promptChars,
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

        if (!result) {
            return null
        }

        // Track the last candidate completion (that is shown as ghost text in the editor) so that
        // we can reuse it if the user types in such a way that it is still valid (such as by typing
        // `ab` if the ghost text suggests `abcd`).
        if (result.source !== InlineCompletionsResultSource.LastCandidate) {
            this.lastCandidate =
                result.items.length > 0
                    ? {
                          uri: document.uri,
                          lastTriggerPosition: position,
                          lastTriggerCurrentLinePrefix: document.lineAt(position).text.slice(0, position.character),
                          lastTriggerNextNonEmptyLine: getNextNonEmptyLine(
                              document.getText(
                                  new vscode.Range(position, document.lineAt(document.lineCount - 1).range.end)
                              )
                          ),
                          // We only need to persist the lastTriggerSelectedInfoItem if we have the
                          // completeSuggestWidgetSelection option enabled since otherwise we do not
                          // take the selection widget into account for the completion.
                          lastTriggerSelectedInfoItem: this.config.completeSuggestWidgetSelection
                              ? context?.selectedCompletionInfo?.text
                              : undefined,
                          result: {
                              logId: result.logId,
                              items: result.items,
                          },
                      }
                    : undefined
        }

        const items = this.processInlineCompletionsForVSCode(result.logId, document, position, result.items, context)

        // A completion that won't be visible in VS Code will not be returned and not be logged.
        if (!isCompletionVisible(items, docContext, this.config.providerConfig, abortController.signal)) {
            return null
        }

        if (items.length > 0) {
            CompletionLogger.suggested(result.logId, InlineCompletionsResultSource[result.source])
        } else {
            CompletionLogger.noResponse(result.logId)
        }

        return {
            items,
        }
    }

    public handleDidAcceptCompletionItem(logId: string, lines: number): void {
        // When a completion is accepted, the lastCandidate should be cleared. This makes sure the
        // log id is never reused if the completion is accepted.
        this.lastCandidate = undefined

        CompletionLogger.accept(logId, lines)
    }

    /**
     * Process completions items in VS Code-specific ways.
     */
    private processInlineCompletionsForVSCode(
        logId: string,
        document: vscode.TextDocument,
        position: vscode.Position,
        items: InlineCompletionItem[],
        context: vscode.InlineCompletionContext
    ): vscode.InlineCompletionItem[] {
        return items.map(completion => {
            const currentLine = document.lineAt(position)
            const currentLinePrefix = document.getText(currentLine.range.with({ end: position }))
            let insertText = completion.insertText

            // Append any eventual inline completion context item to the prefix if
            // completeSuggestWidgetSelection is enabled.
            if (this.config.completeSuggestWidgetSelection && context.selectedCompletionInfo) {
                const { range, text } = context.selectedCompletionInfo
                insertText = text.slice(position.character - range.start.character) + insertText
            }

            // Return the completion from the start of the current line (instead of starting at the
            // given position). This avoids UI jitter in VS Code; when typing or deleting individual
            // characters, VS Code reuses the existing completion while it waits for the new one to
            // come in.
            const start = currentLine.range.start

            // The completion will always exclude the same line suffix, so it has to overwrite the
            // current same line suffix and reach to the end of the line.
            const end = currentLine.range.end

            return new vscode.InlineCompletionItem(currentLinePrefix + insertText, new vscode.Range(start, end), {
                title: 'Completion accepted',
                command: 'cody.autocomplete.inline.accepted',
                arguments: [{ codyLogId: logId, codyLines: insertText.split(/\r\n|\r|\n/).length }],
            })
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

function isCompletionVisible(
    completions: vscode.InlineCompletionItem[],
    docContext: DocumentContext,
    providerConfig: ProviderConfig,
    abortSignal: AbortSignal | undefined
): boolean {
    // There are these cases when a completion is being returned here but won't
    // be displayed by VS Code.
    //
    // - When the abort signal was already triggered and a new completion
    //   request was stared.
    // - When the VS Code completion popup is open and we suggest a completion
    //   that does not match the currently selected completion. For now we make
    //   sure to not log these completions as displayed.
    //   TODO: Take this into account when creating the completion prefix.
    // - When no completions contains characters in the current line that are
    //   not in the current line suffix. Since VS Code will try to merge
    //   completion with the suffix, we have to do a per-character diff to test
    //   this.
    const isAborted = abortSignal ? abortSignal.aborted : false
    // const isMatchingPopupItem = completionMatchesPopupItem(completions, document, context)
    const isMatchingSuffix = completionMatchesSuffix(completions, docContext, providerConfig)
    const isVisible = !isAborted && isMatchingSuffix

    return isVisible
}

function currentEditorContentMatchesPopupItem(
    document: vscode.TextDocument,
    context: vscode.InlineCompletionContext
): boolean {
    if (context.selectedCompletionInfo) {
        const currentText = document.getText(context.selectedCompletionInfo.range)
        const selectedText = context.selectedCompletionInfo.text
        console.log({ currentText, selectedText })

        if (!selectedText.startsWith(currentText)) {
            return false
        }
    }
    return true
}

function completionMatchesSuffix(
    completions: vscode.InlineCompletionItem[],
    docContext: DocumentContext,
    providerConfig: ProviderConfig
): boolean {
    // Models that support infilling do not replace an existing suffix but
    // instead insert the completion only at the current cursor position. Thus,
    // we do not need to compare the suffix
    if (providerConfig.supportsInfilling) {
        return true
    }

    const suffix = docContext.currentLineSuffix

    for (const completion of completions) {
        if (typeof completion.insertText !== 'string') {
            continue
        }
        const insertion = completion.insertText
        let j = 0
        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < insertion.length; i++) {
            if (insertion[i] === suffix[j]) {
                j++
            }
        }
        if (j === suffix.length) {
            return true
        }
    }

    return false
}
