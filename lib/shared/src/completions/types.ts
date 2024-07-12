import type * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

export interface AutocompleteFileContextSnippet {
    uri: URI
    startLine: number
    endLine: number
    content: string
}
export interface AutocompleteSymbolContextSnippet extends AutocompleteFileContextSnippet {
    symbol: string
}
export type AutocompleteContextSnippet =
    | AutocompleteFileContextSnippet
    | AutocompleteSymbolContextSnippet

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
}

export interface LinesContext {
    /** Text before the cursor on the same line. */
    currentLinePrefix: string
    /** Text after the cursor on the same line. */
    currentLineSuffix: string

    prevNonEmptyLine: string
    nextNonEmptyLine: string
}
