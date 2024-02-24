import type { Position, TextDocument } from 'vscode'

import { type CompletionParameters, tokensToChars } from '@sourcegraph/cody-shared'

import type { DocumentContext } from '../get-current-doc-context'
import type { InlineCompletionItemWithAnalytics } from '../text-processing/process-inline-completions'
import type { ContextSnippet } from '../types'

import type { FetchCompletionResult } from './fetch-and-process-completions'

export interface ProviderConfig {
    /**
     * A factory to create instances of the provider. This pattern allows us to
     * inject provider specific parameters outside of the callers of the
     * factory.
     */
    create(options: Omit<ProviderOptions, 'id'>): Provider

    /**
     * Hints about the optimal context size (and length of the document prefix and suffix). It is
     * intended to (or possible to) be precise here because the truncation of the document
     * prefix/suffix uses characters, not the LLM's tokenizer.
     */
    contextSizeHints: ProviderContextSizeHints

    /**
     * A string identifier for the provider config used in event logs.
     */
    identifier: string

    /**
     * Defines which model is used with the respective provider.
     */
    model: string
}

interface ProviderContextSizeHints {
    /** Total max length of all context (prefix + suffix + snippets). */
    totalChars: number

    /** Max length of the document prefix (text before the cursor). */
    prefixChars: number

    /** Max length of the document suffix (text after the cursor). */
    suffixChars: number
}

export function standardContextSizeHints(maxContextTokens: number): ProviderContextSizeHints {
    return {
        totalChars: Math.floor(tokensToChars(0.9 * maxContextTokens)), // keep 10% margin for preamble, etc.
        prefixChars: Math.floor(tokensToChars(0.6 * maxContextTokens)),
        suffixChars: Math.floor(tokensToChars(0.1 * maxContextTokens)),
    }
}

export interface ProviderOptions {
    /**
     * A unique and descriptive identifier for the provider.
     */
    id: string

    position: Position
    document: TextDocument
    docContext: DocumentContext
    multiline: boolean
    /**
     * Number of parallel LLM requests per completion.
     */
    n: number
    /**
     *  Timeout in milliseconds for the first completion to be yielded from the completions generator.
     */
    firstCompletionTimeout: number

    // feature flags
    dynamicMultilineCompletions?: boolean
    hotStreak?: boolean
}

export abstract class Provider {
    constructor(public readonly options: Readonly<ProviderOptions>) {}

    public abstract generateCompletions(
        abortSignal: AbortSignal,
        snippets: ContextSnippet[],
        tracer?: CompletionProviderTracer
    ): AsyncGenerator<FetchCompletionResult[]>
}

/**
 * Tracer for {@link Provider}.
 */
export interface CompletionProviderTracer {
    /** Called with the params passed to the LLM. */
    params(params: CompletionParameters): void

    /** Called with the result from the LLM. */
    result(data: CompletionProviderTracerResultData): void
}

export interface CompletionProviderTracerResultData {
    /** The post-processed completions that are returned by the provider. */
    completions: InlineCompletionItemWithAnalytics[]

    /** Free-form text with debugging or timing information. */
    debugMessage?: string
}
