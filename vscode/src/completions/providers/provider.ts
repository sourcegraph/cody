import { tokensToChars } from '@sourcegraph/cody-shared/src/prompt/constants'
import { CompletionParameters } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { DocumentContext } from '../get-current-doc-context'
import { Completion, ContextSnippet } from '../types'

export interface ProviderConfig {
    /**
     * A factory to create instances of the provider. This pattern allows us to
     * inject provider specific parameters outside of the callers of the
     * factory.
     */
    create(options: ProviderOptions): Provider

    /**
     * Hints about the optimal context size (and length of the document prefix and suffix). It is
     * intended to (or possible to) be precise here because the truncation of the document
     * prefix/suffix uses characters, not the LLM's tokenizer.
     */
    contextSizeHints: ProviderContextSizeHints

    /**
     * When set, multi-line completions will trigger more often. This is
     */
    enableExtendedMultilineTriggers: boolean

    /**
     * A string identifier for the provider config used in event logs.
     */
    identifier: string

    /**
     * Defines which model is used with the respective provider.
     */
    model: string

    /**
     * Whether to wait longer to debounce requests. Slow models (such as models running locally)
     * should set this to `true` to avoid overloading the user's machine while they type.
     */
    useLongerDebounce?: boolean
}

export interface ProviderContextSizeHints {
    /** Total max length of all file context (prefix + suffix + snippets). */
    totalFileContextChars: number

    /** Max length of the document prefix (text before the cursor). */
    prefixChars: number

    /** Max length of the document suffix (text after the cursor). */
    suffixChars: number
}

export function standardContextSizeHints(maxContextTokens: number): ProviderContextSizeHints {
    return {
        totalFileContextChars: Math.floor(maxContextTokens * 0.9), // keep 10% margin for preamble, etc.
        prefixChars: Math.floor(tokensToChars(0.6 * maxContextTokens)),
        suffixChars: Math.floor(tokensToChars(0.1 * maxContextTokens)),
    }
}

export interface ProviderOptions {
    // A unique and descriptive identifier for the provider.
    id: string

    docContext: DocumentContext
    fileName: string
    languageId: string
    multiline: boolean
    // Number of parallel LLM requests per completion.
    n: number
}

export abstract class Provider {
    constructor(public readonly options: Readonly<ProviderOptions>) {}

    public abstract generateCompletions(
        abortSignal: AbortSignal,
        snippets: ContextSnippet[],
        tracer?: CompletionProviderTracer
    ): Promise<Completion[]>
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
    /** The raw response from the LLM. */
    rawResponses: unknown

    /** The post-processed completions that are returned by the provider. */
    completions: Completion[]
}
