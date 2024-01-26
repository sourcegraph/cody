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

// Should we share VS Code specific config via cody-shared?
export interface Configuration {
    proxy?: string | null
    codebase?: string
    debugEnable: boolean
    debugFilter: RegExp | null
    debugVerbose: boolean
    telemetryLevel: 'all' | 'off' | 'agent'
    useContext: ConfigurationUseContext
    customHeaders: Record<string, string>
    chatPreInstruction: string
    codeActions: boolean
    commandCodeLenses: boolean
    editorTitleCommandIcon: boolean

    /**
     * Autocomplete
     */
    autocomplete: boolean
    autocompleteLanguages: Record<string, boolean>
    autocompleteAdvancedProvider: 'anthropic' | 'fireworks' | 'unstable-openai' | null
    autocompleteAdvancedModel: string | null
    autocompleteCompleteSuggestWidgetSelection?: boolean
    autocompleteFormatOnAccept?: boolean

    /**
     * Experimental
     */
    experimentalGuardrails: boolean
    experimentalSymfContext: boolean
    experimentalTracing: boolean
    experimentalSimpleChatContext: boolean

    /**
     * Unstable Features for internal testing only
     */
    internalUnstable: boolean

    /**
     * Experimental autocomplete
     */
    autocompleteExperimentalSyntacticPostProcessing?: boolean
    autocompleteExperimentalDynamicMultilineCompletions?: boolean
    autocompleteExperimentalHotStreak?: boolean
    autocompleteExperimentalGraphContext: 'bfg' | 'bfg-mixed' | null
    autocompleteExperimentalOllamaOptions: OllamaOptions

    /**
     * Hidden settings
     */
    isRunningInsideAgent?: boolean
    agentIDE?: 'VSCode' | 'JetBrains' | 'Neovim' | 'Emacs'
    autocompleteTimeouts: AutocompleteTimeouts

    testingLocalEmbeddingsModel: string | undefined
    testingLocalEmbeddingsEndpoint: string | undefined
    testingLocalEmbeddingsIndexLibraryPath: string | undefined
}

export interface AutocompleteTimeouts {
    multiline?: number
    singleline?: number
}

export interface ConfigurationWithAccessToken extends Configuration {
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
