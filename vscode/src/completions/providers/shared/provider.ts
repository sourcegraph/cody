import type { Position, TextDocument } from 'vscode'

import {
    type AuthenticatedAuthStatus,
    type AutocompleteContextSnippet,
    type AutocompleteProviderID,
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    type CodyLLMSiteConfiguration,
    type CompletionParameters,
    type CompletionResponseGenerator,
    type DocumentContext,
    type GitContext,
    type LegacyModelRefStr,
    type Model,
    toLegacyModel,
    tokensToChars,
} from '@sourcegraph/cody-shared'

import type * as CompletionAnalyticsLogger from '../../analytics-logger'
import { defaultCodeCompletionsClient } from '../../default-client'
import type { TriggerKind } from '../../get-inline-completions'
import { type DefaultModel, getModelHelpers } from '../../model-helpers'
import type { InlineCompletionItemWithAnalytics } from '../../text-processing/process-inline-completions'
import { forkSignal, generatorWithErrorObserver, generatorWithTimeout, zipGenerators } from '../../utils'

import type { AutocompleteProviderConfigSource } from './create-provider'
import {
    type FetchCompletionResult,
    fetchAndProcessDynamicMultilineCompletions,
} from './fetch-and-process-completions'

export const MAX_RESPONSE_TOKENS = 256

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
    snippets: AutocompleteContextSnippet[]
    /**
     * Number of parallel LLM requests per completion.
     */
    numberOfCompletionsToGenerate: number
    /**
     *  Timeout in milliseconds for the first completion to be yielded from the completions generator.
     */
    firstCompletionTimeout: number
    completionLogId: CompletionAnalyticsLogger.CompletionLogID

    /**
     * Git related context information. Currently only supports a repo name, which is used by various FIM models in prompt.
     */
    gitContext?: GitContext
    maxContextTokens?: number
}

const DEFAULT_MAX_CONTEXT_TOKENS = 2048
/**
 * Used as `ProviderOptions.legacyModel` fallback value when model ID is unknown otherwise.
 *
 * This most likely indicates that this autocomplete provider is used exclusively by BYOK customers,
 * and clients do not send a model ID in such cases. The model is selected by the Sourcegraph backend
 * based on the current site configuration.
 */
export const BYOK_MODEL_ID_FOR_LOGS = 'model-will-be-picked-by-sourcegraph-backend-based-on-site-config'

type ProviderModelOptions = {
    model: Model
}

// TODO: drop this in favor of `ProviderModelOptions` once we migrate to
// the new model ref syntax everywhere.
type ProviderLegacyModelOptions = {
    /**
     * The model name _without_ the provider ID.
     * e.g. "claude-3-sonnet-20240229", not "anthropic/claude-3-sonnet-20240229".
     */
    legacyModel: string
}

export type ProviderOptions = (ProviderModelOptions | ProviderLegacyModelOptions) & {
    id: string
    /**
     * Defaults to `DEFAULT_MAX_CONTEXT_TOKENS`
     */
    maxContextTokens?: number
    mayUseOnDeviceInference?: boolean
    source: AutocompleteProviderConfigSource

    configOverwrites?: CodyLLMSiteConfiguration | null
}

export type ProviderFactoryParams = {
    /**
     * Model instance created from the server-side model config API response.
     */
    model?: Model
    /**
     * The model name _without_ the provider ID.
     * e.g. "claude-3-sonnet-20240229", not "anthropic/claude-3-sonnet-20240229".
     *
     * Kept here for backward compatibility. Should be replaced fully by `model`.
     */
    legacyModel?: Provider['legacyModel']
    /**
     * Client provider ID.
     */
    provider: AutocompleteProviderID
    /**
     * How the provider/model combination was resolved.
     * Used for debugging purposes.
     */
    source: AutocompleteProviderConfigSource

    mayUseOnDeviceInference?: boolean

    authStatus: Pick<AuthenticatedAuthStatus, 'endpoint'>
    configOverwrites: CodyLLMSiteConfiguration | null
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
     * The model name _without_ the provider ID.
     * e.g. "claude-3-sonnet-20240229", not "anthropic/claude-3-sonnet-20240229".
     */
    public legacyModel: string
    public contextSizeHints: ProviderContextSizeHints
    public client: CodeCompletionsClient = defaultCodeCompletionsClient.instance!
    public configSource: AutocompleteProviderConfigSource
    public mayUseOnDeviceInference: boolean

    protected maxContextTokens: number
    protected promptChars: number
    protected modelHelper: DefaultModel

    private configOverwrites: CodyLLMSiteConfiguration | null

    protected defaultRequestParams = {
        timeoutMs: 7_000,
        stopSequences: ['\n\n', '\n\r\n'],
        maxTokensToSample: MAX_RESPONSE_TOKENS,
        temperature: 0.2,
        topK: 0,
    } as const satisfies Omit<CodeCompletionsParams, 'messages'>

    private isModernSourcegraphInstanceWithoutModelAllowlist = true

    constructor(public readonly options: Readonly<ProviderOptions>) {
        const {
            id,
            maxContextTokens = DEFAULT_MAX_CONTEXT_TOKENS,
            mayUseOnDeviceInference = false,
            source,
            configOverwrites,
        } = options

        if ('model' in options) {
            this.model = options.model
            this.legacyModel = toLegacyModel(options.model.id)
        } else {
            this.legacyModel = toLegacyModel(options.legacyModel)
        }

        this.id = id
        this.maxContextTokens = maxContextTokens
        this.mayUseOnDeviceInference = mayUseOnDeviceInference
        this.configSource = source

        this.modelHelper = getModelHelpers(this.legacyModel)
        this.promptChars = tokensToChars(maxContextTokens - MAX_RESPONSE_TOKENS)
        this.contextSizeHints = {
            totalChars: Math.floor(tokensToChars(0.9 * this.maxContextTokens)), // keep 10% margin for preamble, etc.
            prefixChars: Math.floor(tokensToChars(0.6 * this.maxContextTokens)),
            suffixChars: Math.floor(tokensToChars(0.1 * this.maxContextTokens)),
        }

        this.configOverwrites = configOverwrites ?? null
    }

    public abstract getRequestParams(options: GenerateCompletionsOptions): object

    /**
     * Returns the passed model ID only if we're using Cody Gateway (not BYOK) and
     * the model ID is resolved on the client.
     */
    protected maybeFilterOutModel(
        model?: typeof BYOK_MODEL_ID_FOR_LOGS | LegacyModelRefStr
    ): LegacyModelRefStr | undefined {
        if (
            model === BYOK_MODEL_ID_FOR_LOGS ||
            !model ||
            !this.isModernSourcegraphInstanceWithoutModelAllowlist
        ) {
            return undefined
        }

        // The model ID is ignored by BYOK clients (configOverwrites?.provider !== 'sourcegraph') so
        // we can remove it from the request params we send to the backend.
        return this.configOverwrites?.provider === 'sourcegraph' ? model : undefined
    }

    protected getCompletionResponseGenerator(
        generateOptions: GenerateCompletionsOptions,
        requestParams: CodeCompletionsParams,
        abortController: AbortController
    ): Promise<CompletionResponseGenerator> {
        return Promise.resolve(this.client.complete(requestParams, abortController))
    }

    public async generateCompletions(
        generateOptions: GenerateCompletionsOptions,
        abortSignal: AbortSignal,
        tracer?: CompletionProviderTracer
    ): Promise<AsyncGenerator<FetchCompletionResult[]>> {
        const { docContext, numberOfCompletionsToGenerate } = generateOptions

        const requestParams = this.getRequestParams(generateOptions) as CodeCompletionsParams
        tracer?.params(requestParams)

        const completionsGenerators = Array.from({ length: numberOfCompletionsToGenerate }).map(
            async () => {
                const abortController = forkSignal(abortSignal)

                const completionResponseGenerator = generatorWithErrorObserver(
                    generatorWithTimeout(
                        await this.getCompletionResponseGenerator(
                            generateOptions,
                            requestParams,
                            abortController
                        ),
                        requestParams.timeoutMs,
                        abortController
                    ),
                    error => {
                        if (error instanceof Error) {
                            // If an "unsupported code completion model" error is thrown,
                            // it's most likely because we started adding the `model` identifier to
                            // requests to ensure the clients does not crash when the default site
                            // config value changes.
                            //
                            // Older instances do not allow for the `model` to be set, even to
                            // identifiers it supports and thus the error.
                            //
                            // If it happens once, we disable the behavior where the client includes a
                            // `model` parameter.
                            if (
                                error.message.includes('Unsupported code completion model') ||
                                error.message.includes('Unsupported chat model') ||
                                error.message.includes('Unsupported custom model')
                            ) {
                                this.isModernSourcegraphInstanceWithoutModelAllowlist = false
                            }
                        }
                    }
                )

                return fetchAndProcessDynamicMultilineCompletions({
                    completionResponseGenerator,
                    abortController,
                    generateOptions,
                    providerSpecificPostProcess: content =>
                        this.modelHelper.postProcess(content, docContext),
                })
            }
        )

        /**
         * This implementation waits for all generators to yield values
         * before passing them to the consumer (request-manager). While this may appear
         * as a performance bottleneck, it's necessary for the current design.
         *
         * The consumer operates on promises, allowing only a single resolve call
         * from `requestManager.request`. Therefore, we must wait for the initial
         * batch of completions before returning them collectively, ensuring all
         * are included as suggested completions.
         *
         * To circumvent this performance issue, a method for adding completions to
         * the existing suggestion list is needed. Presently, this feature is not
         * available, and the switch to async generators maintains the same behavior
         * as with promises.
         */
        return zipGenerators(await Promise.all(completionsGenerators))
    }
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
