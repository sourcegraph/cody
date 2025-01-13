import type * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

export type AutocompleteContextSnippetMetadataFields = Record<string, number | string>

interface AutocompleteContextSnippetMetadata {
    /**
     * This field is relevant for user action context sources such as `recent-edit`, `recent-copy` and `recent-viewport`.
     * It indicates the time in milliseconds since the action was performed (eg: time Since the last edit).
     */
    timeSinceActionMs?: number
    /**
     * Additional metadata fields that can be used to store arbitrary key-value pairs.
     * The values can be either numbers or strings.
     */
    retrieverMetadata?: AutocompleteContextSnippetMetadataFields
}

export interface AutocompleteBaseContextSnippet {
    type: 'base'
    identifier: string
    uri: URI
    content: string
    /**
     * Metadata populated by the context retriever.
     * The metadata can be specific to the context retriever and may not apply to other context retrievers.
     * The metadata can be used by other components such as `auto-edit` to determine if the snippet is still relevant or logging for offline analysis.
     */
    metadata?: AutocompleteContextSnippetMetadata
}

export interface AutocompleteFileContextSnippet extends Omit<AutocompleteBaseContextSnippet, 'type'> {
    type: 'file'
    startLine: number
    endLine: number
}

export interface AutocompleteSymbolContextSnippet extends Omit<AutocompleteFileContextSnippet, 'type'> {
    type: 'symbol'
    symbol: string
}

export type AutocompleteContextSnippet =
    | AutocompleteFileContextSnippet
    | AutocompleteSymbolContextSnippet
    | AutocompleteBaseContextSnippet

export interface DocumentContext extends DocumentDependentContext, LinesContext {
    position: vscode.Position
    multilineTrigger: string | null
    multilineTriggerPosition: vscode.Position | null
    /**
     * A temporary workaround for the fact that we cannot modify `TextDocument` text.
     * Having these fields set on a `DocumentContext` means we can still get the full
     * document text in the `parse-completion` function with the "virtually" inserted
     * completion text.
     *
     * TODO(valery): we need a better abstraction that would allow us to mutate
     * the `TextDocument` text in memory without actually pasting it into the `TextDocument`
     * and that would not require copy-pasting and modifying the whole document text
     * on every completion update or new virtual completion creation.
     */
    injectedCompletionText?: string
    positionWithoutInjectedCompletionText?: vscode.Position
    /**
     * Required to manipulate the document context after it was created.
     */
    maxPrefixLength: number
    maxSuffixLength: number
}

export interface GitContext {
    repoName: string
}

export interface DocumentDependentContext {
    prefix: string
    suffix: string
    /**
     * This is set when the document context is looking at the selected item in the
     * suggestion widget and injects the item into the prefix.
     */
    injectedPrefix: string | null

    completePrefix: string
    completeSuffix: string
}

export interface LinesContext {
    /** Text before the cursor on the same line. */
    currentLinePrefix: string
    /** Text after the cursor on the same line. */
    currentLineSuffix: string

    prevNonEmptyLine: string
    nextNonEmptyLine: string
}
