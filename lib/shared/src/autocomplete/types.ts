import { AutocompleteContext, Position, Range, TextDocument } from '../agent/protocol'

export interface AutocompleteParams {
    id: string
    filePath: string
    position: Position
    languageId: string
    context: AutocompleteContext
    documents: Map<string, TextDocument>
}

export interface ExecuteAutocompleteResult {
    items: InlineCompletionItem[]
}

export interface InlineCompletionItem {
    insertText: string
    range: Range
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

export interface DocumentContext {
    prefix: string
    suffix: string

    /** Text before the cursor on the same line. */
    currentLinePrefix: string

    /** Text after the cursor on the same line. */
    currentLineSuffix: string

    prevNonEmptyLine: string
    nextNonEmptyLine: string
}
