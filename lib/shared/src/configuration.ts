import type { Observable } from 'observable-fns'
import type { EmbeddingsProvider } from './codebase-context/context-status'
import type { FileURI } from './common/uri'

import type { PromptString } from './prompt/prompt-string'

export type ConfigurationUseContext = 'embeddings' | 'keyword' | 'none' | 'blended' | 'unified'

/**
 * Get the numeric ID corresponding to the ConfigurationUseContext mode.
 */
export const CONTEXT_SELECTION_ID: Record<ConfigurationUseContext, number> = {
    none: 0,
    embeddings: 1,
    keyword: 2,
    blended: 10,
    unified: 11,
}

/**
 * A wrapper around a configuration source that lets the client retrieve the current config and
 * watch for changes.
 */
export interface ConfigWatcher<C> {
    changes: Observable<C>
    get(): C
}

/**
 * Client configuration, such as VS Code settings.
 */
export interface ClientConfiguration {
    proxy?: string | null
    codebase?: string
    debugFilter: RegExp | null
    debugVerbose: boolean
    telemetryLevel: 'all' | 'off' | 'agent'
    telemetryClientName?: string
    useContext: ConfigurationUseContext
    customHeaders?: Record<string, string>
    chatPreInstruction: PromptString
    editPreInstruction: PromptString
    codeActions: boolean
    commandHints: boolean
    commandCodeLenses: boolean

    /**
     * Autocomplete
     */
    autocomplete: boolean
    autocompleteLanguages: Record<string, boolean>
    autocompleteAdvancedProvider:
        | 'anthropic'
        | 'fireworks'
        | 'unstable-gemini'
        | 'unstable-openai'
        | 'experimental-openaicompatible'
        | 'experimental-ollama'
        | null
    autocompleteAdvancedModel: string | null
    autocompleteCompleteSuggestWidgetSelection?: boolean
    autocompleteFormatOnAccept?: boolean
    autocompleteDisableInsideComments: boolean

    /**
     * Experimental
     */
    experimentalTracing: boolean
    experimentalSupercompletions: boolean
    experimentalCommitMessage: boolean
    experimentalNoodle: boolean
    experimentalMinionAnthropicKey: string | undefined
    experimentalGuardrailsTimeoutSeconds: number | undefined

    /**
     * Unstable Features for internal testing only
     */
    internalUnstable: boolean
    internalDebugContext?: boolean

    /**
     * Experimental autocomplete
     */
    autocompleteExperimentalGraphContext: 'lsp-light' | 'bfg' | 'bfg-mixed' | 'tsc' | 'tsc-mixed' | null
    autocompleteExperimentalOllamaOptions: OllamaOptions
    autocompleteExperimentalFireworksOptions?: ExperimentalFireworksConfig
    autocompleteExperimentalMultiModelCompletions?: MultimodelSingleModelConfig[]
    autocompleteExperimentalPreloadDebounceInterval?: number

    /**
     * Hidden settings
     */
    hasNativeWebview: boolean
    isRunningInsideAgent?: boolean
    agentIDE?: CodyIDE
    agentIDEVersion?: string
    agentExtensionVersion?: string
    agentHasPersistentStorage?: boolean
    autocompleteFirstCompletionTimeout: number

    testingModelConfig: EmbeddingsModelConfig | undefined
}

export enum CodyIDE {
    VSCode = 'VSCode',
    JetBrains = 'JetBrains',
    Neovim = 'Neovim',
    Emacs = 'Emacs',
    Web = 'Web',
    VisualStudio = 'VisualStudio',
    Eclipse = 'Eclipse',
}

export type ClientConfigurationWithEndpoint = Omit<ClientConfigurationWithAccessToken, 'accessToken'>

export interface ClientConfigurationWithAccessToken extends ClientConfiguration {
    serverEndpoint: string
    /** The access token, which is stored in the secret storage (not configuration). */
    accessToken: string | null
}

export interface OllamaOptions {
    /**
     * URL to the Ollama server.
     * @example http://localhost:11434
     */
    url: string

    /**
     * The Ollama model to use. Currently only codellama and derived models are supported.
     * @example codellama:7b-code
     */
    model: string

    /**
     * Parameters for how Ollama will run the model. See Ollama PARAMETER documentation.
     */
    parameters?: OllamaGenerateParameters
}

/**
 * @see https://sourcegraph.com/github.com/jmorganca/ollama/-/blob/docs/modelfile.md#valid-parameters-and-values
 * @see https://sourcegraph.com/github.com/jmorganca/ollama/-/blob/api/types.go?L143
 */
export interface OllamaGenerateParameters {
    /**
     * Sets the random number seed to use for generation. Setting this to a specific number will make the model generate the same text for the same prompt.
     * (Default: 0)
     */
    seed?: number

    /**
     * Sets the size of the context window used to generate the next token.
     * (Default: 2048)
     */
    num_ctx?: number

    /**
     * The temperature of the model. Increasing the temperature will make the model answer more creatively.
     * (Default: 0.8)
     */
    temperature?: number

    /**
     * Sets the stop sequences to use. When this pattern is encountered the LLM will stop generating text and return.
     * Multiple stop patterns may be set by specifying multiple separate stop parameters in a modelfile.
     */
    stop?: string[]

    /**
     * Reduces the probability of generating nonsense. A higher value (e.g. 100) will give more diverse answers,
     * while a lower value (e.g. 10) will be more conservative.
     * (Default: 40)
     */
    top_k?: number

    /**
     * Works together with top-k. A higher value (e.g., 0.95) will lead to more diverse text,
     * while a lower value (e.g., 0.5) will generate more focused and conservative text.
     * (Default: 0.9)
     */
    top_p?: number

    /**
     * Sets the number of threads to use during computation.
     * By default, Ollama will detect this for optimal performance.
     * It is recommended to set this value to the number of physical CPU cores
     * your system has (as opposed to the logical number of cores).
     */
    num_thread?: number

    /**
     * Maximum number of tokens to predict when generating text.
     * (Default: 128, -1 = infinite generation, -2 = fill context)
     */
    num_predict?: number

    /**
     * Enable Mirostat sampling for controlling perplexity.
     * (default: 0, 0 = disabled, 1 = Mirostat, 2 = Mirostat 2.0)
     */
    mirostat?: number

    /**
     * Influences how quickly the algorithm responds to feedback from the generated text. A lower learning rate will result in slower adjustments,
     * while a higher learning rate will make the algorithm more responsive.
     * (Default: 0.1)
     */
    mirostat_eta?: number

    /**
     * Controls the balance between coherence and diversity of the output. A lower value will result in more focused and coherent text.
     * (Default: 5.0)
     */
    mirostat_tau?: number

    /**
     * The number of GQA groups in the transformer layer. Required for some models, for example it is 8 for llama2:70b.
     */
    num_gqa?: number

    /**
     * The number of layers to send to the GPU(s). On macOS it defaults to 1 to enable metal support, 0 to disable.
     */
    num_gpu?: number

    /**
     * Sets how far back for the model to look back to prevent repetition.
     * (Default: 64, 0 = disabled, -1 = num_ctx)
     */
    repeat_last_n?: number

    /**
     * Sets how strongly to penalize repetitions. A higher value (e.g., 1.5) will penalize repetitions more strongly,
     * while a lower value (e.g., 0.9) will be more lenient.
     * (Default: 1.1)
     */
    repeat_penalty?: number

    /**
     * Tail free sampling is used to reduce the impact of less probable tokens from the output.
     * A higher value (e.g., 2.0) will reduce the impact more, while a value of 1.0 disables this setting.
     * (default: 1)
     */
    tfs_z?: number
}

export interface ExperimentalFireworksConfig {
    url: string
    token: string
    model: string
    parameters?: {
        temperature?: number
        top_k?: number
        top_p?: number
        stop?: string[]
    }
}

export interface MultimodelSingleModelConfig {
    provider: string
    model: string
    // This flag decides if to enable "cody.autocomplete.experimental.fireworksOptions" settings when creating a custom provider
    enableExperimentalFireworksOverrides: boolean
}

export interface EmbeddingsModelConfig {
    model: string
    dimension: number
    provider: EmbeddingsProvider
    endpoint: string
    indexPath: FileURI
}

/**
 * @see https://console.groq.com/docs/text-chat
 */
export interface GroqCompletionOptions {
    /**
     *An optional name to disambiguate messages from different users with the same role.
     */
    name?: string
    /**
     *Seed used for sampling. Groq attempts to return the same response to the same request with an identical seed.
     */
    seed?: number
    /**
     *The maximum number of tokens that the model can process in a single response. This limits ensures computational efficiency and resource management.
     */
    max_tokens?: number
    /**
     *A method of text generation where a model will only consider the most probable next tokens that make up the probability p. 0.5 means half of all likelihood-weighted options are considered.
     */
    top_p?: number
    /**
     *Controls randomness of responses. A lower temperature leads to more predictable outputs while a higher temperature results in more varies and sometimes more creative outputs.
     */
    temperature?: number
    /**
     *User server-side events to send the completion in small deltas rather than in a single batch after all processing has finished. This reduces the time to first token received.
     */
    stream?: boolean
    /**
     *A stop sequence is a predefined or user-specified text string that signals an AI to stop generating content, ensuring its responses remain focused and concise.
     */
    stop?: string[]
}
