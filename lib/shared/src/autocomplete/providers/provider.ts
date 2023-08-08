import { CompletionParameters } from '../../sourcegraph-api/completions/types'
import { Completion, ReferenceSnippet } from '../types'

export interface ProviderConfig {
    /**
     * A factory to create instances of the provider. This pattern allows us to
     * inject provider specific parameters outside of the callers of the
     * factory.
     */
    create(options: ProviderOptions): Provider

    /**
     * The maximum number of unicode characters that should be included in the
     * context window. Note that these are not tokens as the definition can vary
     * between models.
     *
     * This value is used for determining the length of prefix, suffix, and
     * snippets and can be validated by the provider implementing it.
     */
    maximumContextCharacters: number

    /**
     * When set, multi-line completions will trigger more often. This is
     */
    enableExtendedMultilineTriggers: boolean

    /**
     * A string identifier for the provider config used in event logs.
     */
    identifier: string

    /**
     * Indicating whether the provider supports infilling.
     */
    supportsInfilling: boolean
}

export interface ProviderOptions {
    /** A unique and descriptive identifier for the provider. */
    id: string

    prefix: string
    suffix: string
    fileName: string
    languageId: string
    multiline: boolean
    // Relative length to `maximumContextCharacters`
    responsePercentage: number
    prefixPercentage: number
    suffixPercentage: number
    // Number of parallel LLM requests per completion.
    n: number
}

export abstract class Provider {
    constructor(public readonly options: Readonly<ProviderOptions>) {}

    public abstract generateCompletions(
        abortSignal: AbortSignal,
        snippets: ReferenceSnippet[],
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
