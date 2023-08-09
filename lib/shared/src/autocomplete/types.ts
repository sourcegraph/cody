export interface AutocompleteParams {
    filePath: string
    position: Position
    context: AutocompleteContext
    prefix: string
    suffix: string
    languageId: string
    multiline: boolean
}

export interface AutocompleteContext {
    triggerKind: 'invoke' | 'automatic'
}

export interface ExecuteAutocompleteResult {
    items: InlineCompletionItem[]
}

export interface InlineCompletionItem {
    insertText: string
    range: Range
}
export interface Position {
    // 0-indexed
    line: number
    // 0-indexed
    character: number
}

export interface Range {
    start: Position
    end: Position
}

export interface Completion {
    content: string
    stopReason?: string
}

/**
 * Keep property names in sync with the `EmbeddingsSearchResult` type.
 */
export interface ReferenceSnippet {
    fileName: string
    content: string
}
