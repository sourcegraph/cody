import type { Position, TextDocument } from 'vscode'

import {
    type AuthenticatedAuthStatus,
    type AutocompleteContextSnippet,
    type ClientConfigurationWithAccessToken,
    type CodeCompletionsClient,
    type CompletionParameters,
    type DocumentContext,
    type GitContext,
    type Model,
    tokensToChars,
} from '@sourcegraph/cody-shared'

import type { TriggerKind } from '../get-inline-completions'
import type * as CompletionLogger from '../logger'
import type { InlineCompletionItemWithAnalytics } from '../text-processing/process-inline-completions'

import { defaultCodeCompletionsClient } from '../default-client'
import { type DefaultModel, getModelHelpers } from '../model-helpers'
import type { AutocompleteProviderConfigSource, AutocompleteProviderID } from './create-provider'
import type { FetchCompletionResult } from './fetch-and-process-completions'
import { MAX_RESPONSE_TOKENS } from './get-completion-params'

export interface ProviderContextSizeHints {
    /** Total max length of all context (prefix + suffix + snippets). */
    totalChars: number

    /** Max length of the document prefix (text before the cursor). */
    prefixChars: number

    /** Max length of the document suffix (text after the cursor). */
    suffixChars: number
}

export interface GenerateCompletionsOptions {
    position: Position
    document: TextDocument
    docContext: DocumentContext
    multiline: boolean
    triggerKind: TriggerKind
    /**
     * Number of parallel LLM requests per completion.
     */
    numberOfCompletionsToGenerate: number
    /**
     *  Timeout in milliseconds for the first completion to be yielded from the completions generator.
     */
    firstCompletionTimeout: number
    completionLogId: CompletionLogger.CompletionLogID

    /**
     * Git related context information. Currently only supports a repo name, which is used by various FIM models in prompt.
     */
    gitContext?: GitContext
    maxContextTokens?: number

    authStatus: Pick<
        AuthenticatedAuthStatus,
        'userCanUpgrade' | 'endpoint' | 'isFireworksTracingEnabled'
    >

    // TODO: eliminate by using config watcher
    config: ClientConfigurationWithAccessToken
}

const DEFAULT_MAX_CONTEXT_TOKENS = 2048

type ProviderModelOptions = {
    model: Model
}

// TODO: drop this in favor of `ProviderModelOptions` once we migrate to
// the new model ref syntax everywhere.
type ProviderLegacyModelOptions = {
    legacyModel: string
}

export type ProviderOptions = (ProviderModelOptions | ProviderLegacyModelOptions) & {
    id: string
    anonymousUserID: string
    /**
     * Defaults to `DEFAULT_MAX_CONTEXT_TOKENS`
     */
    maxContextTokens?: number
    mayUseOnDeviceInference?: boolean
    source: AutocompleteProviderConfigSource
}

export type ProviderFactoryParams = {
    /**
     * Model instance created from the server-side model config API response.
     */
    model?: Model
    /**
     * Model string ID kept here for backward compatibility. Should be replaced fully by `model`.
     */
    legacyModel?: string
    /**
     * Client provider ID.
     */
    provider: AutocompleteProviderID
    /**
     * How the provider/model combination was resolved.
     * Used for debugging purposes.
     */
    source: AutocompleteProviderConfigSource

    anonymousUserID: string
    config: ClientConfigurationWithAccessToken
    mayUseOnDeviceInference?: boolean
}

export type ProviderFactory = (params: ProviderFactoryParams) => Provider

export abstract class Provider {
    /**
     * A unique and descriptive identifier for the provider.
     */
    public id: string
    /**
     * The Model info constructed from the server-side model configuration payload.
     */
    public model?: Model
    /**
     * Either `provider/model-name` or `model-name` depending on the provider implementation.
     * TODO: migrate to one syntax.
     */
    public legacyModel: string
    public contextSizeHints: ProviderContextSizeHints
    public client: CodeCompletionsClient = defaultCodeCompletionsClient.instance!
    public configSource: AutocompleteProviderConfigSource

    protected maxContextTokens: number
    protected anonymousUserID: string

    protected promptChars: number
    protected modelHelper: DefaultModel

    public mayUseOnDeviceInference: boolean

    constructor(public readonly options: Readonly<ProviderOptions>) {
        const {
            id,
            maxContextTokens = DEFAULT_MAX_CONTEXT_TOKENS,
            anonymousUserID,
            mayUseOnDeviceInference = false,
            source,
        } = options

        if ('model' in options) {
            this.model = options.model
            this.legacyModel = options.model.id
        } else {
            this.legacyModel = options.legacyModel
        }

        this.id = id
        this.maxContextTokens = maxContextTokens
        this.anonymousUserID = anonymousUserID
        this.mayUseOnDeviceInference = mayUseOnDeviceInference
        this.configSource = source

        this.modelHelper = getModelHelpers(this.legacyModel)
        this.promptChars = tokensToChars(maxContextTokens - MAX_RESPONSE_TOKENS)
        this.contextSizeHints = {
            totalChars: Math.floor(tokensToChars(0.9 * this.maxContextTokens)), // keep 10% margin for preamble, etc.
            prefixChars: Math.floor(tokensToChars(0.6 * this.maxContextTokens)),
            suffixChars: Math.floor(tokensToChars(0.1 * this.maxContextTokens)),
        }
    }

    public abstract generateCompletions(
        options: GenerateCompletionsOptions,
        abortSignal: AbortSignal,
        snippets: AutocompleteContextSnippet[],
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
