import { LRUCache } from 'lru-cache'
import * as uuid from 'uuid'
import * as vscode from 'vscode'

import type { Span } from '@opentelemetry/api'
import type { DocumentContext } from '@sourcegraph/cody-shared'
import type { CompletionItemID, CompletionLogID } from './logger'
import type { RequestParams } from './request-manager'
import type { InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'

interface AutocompleteItemParams {
    insertText: string | vscode.SnippetString
    logId: CompletionLogID
    range: vscode.Range
    trackedRange: vscode.Range
    requestParams: RequestParams
    completionItem: InlineCompletionItemWithAnalytics
    context: vscode.InlineCompletionContext
    command?: vscode.Command
    span?: Span
}

export class AutocompleteItem extends vscode.InlineCompletionItem {
    /**
     * An ID used to track this particular completion item. This is used mainly for the Agent which,
     * given it's JSON RPC interface, needs to be able to identify the completion item and can not
     * rely on the object reference like the VS Code API can. This allows us to simplify external
     * API's that require the completion item to only have an ID.
     */
    public id: CompletionItemID

    /**
     * An ID used to track the completion request lifecycle. This is used for completion analytics
     * bookkeeping.
     */
    public logId: CompletionLogID

    /**
     * The range needed for tracking the completion after inserting. This is needed because the
     * actual insert range might overlap with content that is already in the document since we set
     * it to always start with the current line beginning in VS Code.
     *
     * TODO: Remove the need for making having this typed as undefined.
     */
    public trackedRange: vscode.Range | undefined

    /**
     * The request params used to fetch the completion item.
     */
    public requestParams: RequestParams

    /**
     * The completion item used for analytics perspectives. This one is the raw completion without
     * the VS Code specific changes applied via processInlineCompletionsForVSCode.
     */
    public analyticsItem: InlineCompletionItemWithAnalytics

    /**
     * Eventual Open Telemetry span associated with the completion request
     */
    public span: Span | undefined

    /**
     * The completion context used to fetch the completion item.
     */
    public context: vscode.InlineCompletionContext

    constructor(params: AutocompleteItemParams) {
        const {
            insertText,
            logId,
            range,
            trackedRange,
            requestParams,
            completionItem,
            command,
            span,
            context,
        } = params

        super(insertText, range, command)

        this.id = uuid.v4() as CompletionItemID
        this.logId = logId
        this.trackedRange = trackedRange
        this.requestParams = requestParams
        this.analyticsItem = completionItem
        this.span = span
        this.context = context
    }
}

export interface AutocompleteInlineAcceptedCommandArgs {
    codyCompletion: AutocompleteItem
}

// Maintain a cache of recommended VS Code completion items. This allows us to find the suggestion
// request ID that this completion was associated with and allows our agent backend to track
// completions with a single ID (VS Code uses the completion result item object reference as an ID
// but since the agent uses a JSON RPC bridge, the object reference is no longer known later).
class SuggestedAutocompleteItemsCache {
    private cache = new LRUCache<CompletionItemID, AutocompleteItem>({
        max: 60,
    })

    public get<T extends object>(
        completionOrItemId: CompletionItemID | T
    ): AutocompleteItem | T | undefined {
        return typeof completionOrItemId === 'string'
            ? this.cache.get(completionOrItemId)
            : completionOrItemId
    }

    public add(item: AutocompleteItem): void {
        this.cache.set(item.id, item)
    }
}

export const suggestedAutocompleteItemsCache = new SuggestedAutocompleteItemsCache()

/**
 * Convert `InlineCompletionItemWithAnalytics` to `AutocompleteItem` suitable for bookkeeping
 * in completion provider callbacks like `show` and `accept`.
 */
export function analyticsItemToAutocompleteItem(
    logId: CompletionLogID,
    document: vscode.TextDocument,
    docContext: DocumentContext,
    position: vscode.Position,
    items: InlineCompletionItemWithAnalytics[],
    context: vscode.InlineCompletionContext,
    span: Span
): AutocompleteItem[] {
    return items.map(item => {
        const { insertText, range } = item
        const currentLine = document.lineAt(position)

        const start = range?.start || position

        // If the completion does not have a range set it will always exclude the same line suffix,
        // so it has to overwrite the current same line suffix and reach to the end of the line.
        const end = range?.end || currentLine.range.end

        const vscodeInsertRange = new vscode.Range(start, end)
        const trackedRange = new vscode.Range(start.line, start.character, end.line, end.character)

        const command = {
            title: 'Completion accepted',
            command: 'cody.autocomplete.inline.accepted',
            arguments: [
                {
                    // This is going to be set to the AutocompleteItem after initialization
                    codyCompletion: undefined as any as AutocompleteItem,
                } satisfies AutocompleteInlineAcceptedCommandArgs,
            ],
        } satisfies vscode.Command

        const requestParams = {
            document,
            docContext,
            selectedCompletionInfo: context?.selectedCompletionInfo,
            position,
        } satisfies RequestParams

        const autocompleteItem = new AutocompleteItem({
            insertText,
            logId,
            range: vscodeInsertRange,
            trackedRange,
            requestParams,
            completionItem: item,
            command,
            span,
            context,
        })

        command.arguments[0].codyCompletion = autocompleteItem

        return autocompleteItem
    })
}

/**
 * Adjust the completion insert text and range to start from beginning of the current line
 * (instead of starting at the given position). This avoids UI jitter in VS Code; when
 * typing or deleting individual characters, VS Code reuses the existing completion
 * while it waits for the new one to come in.
 */
export function updateInsertRangeForVSCode(items: AutocompleteItem[]): AutocompleteItem[] {
    return items.map(item => {
        const {
            insertText,
            range,
            requestParams: { position, document },
        } = item

        const currentLine = document.lineAt(position)
        const currentLinePrefix = document.getText(currentLine.range.with({ end: position }))

        const start = currentLine.range.start
        // If the completion does not have a range set it will always exclude the same line suffix,
        // so it has to overwrite the current same line suffix and reach to the end of the line.
        // const end = range?.end || currentLine.range.end
        // add the number of characters of insert text to position as the end 
        const theEnd = new vscode.Position(position.line, position.character + (insertText as string).length)

        const vscodeInsertRange = new vscode.Range(start, theEnd)

        item.range = vscodeInsertRange
        item.insertText = currentLinePrefix + (insertText as string)

        return item
    })
}
