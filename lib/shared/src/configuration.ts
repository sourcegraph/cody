import type { ClientCapabilitiesWithLegacyFields } from './configuration/clientCapabilities'
import type { ChatModelProviderConfig } from './models/sync'

import type { PromptString } from './prompt/prompt-string'
import type { ReadonlyDeep } from './utils'

/**
 * Represents the source of an authentication token generation, either a redirect or paste flow.
 * A redirect flow is initiated by the user clicking a link in the browser, while a paste flow is initiated by the user
 * manually entering the access from into the VsCode App.
 */
export type TokenSource = 'redirect' | 'paste'

/**
 * The user's authentication credentials, which are stored separately from the rest of the
 * configuration.
 */
export interface AuthCredentials {
    serverEndpoint: string
    accessToken: string | null
    tokenSource?: TokenSource | undefined
}

export interface AutoEditsTokenLimit {
    prefixTokens: number
    suffixTokens: number
    maxPrefixLinesInArea: number
    maxSuffixLinesInArea: number
    codeToRewritePrefixLines: number
    codeToRewriteSuffixLines: number
    contextSpecificTokenLimit: Record<string, number>
}

/**
 * Configuration for the auto-edits model provider.
 * Used to configure the model provider for auto-edits functionality in the VS Code extension.
 */
export interface AutoEditsModelConfig {
    /** The provider service to use for auto-edits. Can be 'openai', 'fireworks', 'cody-gateway', or 'sourcegraph' */
    provider: 'openai' | 'fireworks' | 'cody-gateway' | 'sourcegraph'
    /** The specific model identifier to use for auto-edits */
    model: string
    /** The endpoint URL for the provider's API */
    url: string
    /** API key for authentication with the provider */
    apiKey: string
    /** Token limits configuration for the model's context window */
    tokenLimit: AutoEditsTokenLimit
    /** Whether the model is a chat-based model (true) or completions model (false)
     *  Depending on this variable:
     *   - The request is directed either to chat or completions endpoint
     *   - The prompt is formatted accordingly
     */
    isChatModel: boolean
}

export interface NetConfiguration {
    mode?: string | undefined | null
    proxy?: {
        endpoint?: string | undefined | null
        cacert?: string | undefined | null
        skipCertValidation?: boolean | undefined | null
    }
    vscode?: string | undefined | null
}

export interface AgenticContextConfiguration {
    shell?: {
        allow?: string[] | undefined | null
        block?: string[] | undefined | null
    }
}

interface RawClientConfiguration {
    net: NetConfiguration
    codebase?: string
    debugFilter: RegExp | null
    debugVerbose: boolean
    telemetryLevel: 'all' | 'off' | 'agent'

    serverEndpoint?: string
    customHeaders?: Record<string, string>
    chatPreInstruction?: PromptString
    editPreInstruction?: PromptString
    codeActions: boolean
    commandHints: boolean
    commandCodeLenses: boolean

    // Deep Cody
    agenticContextExperimentalShell?: boolean
    agenticContextExperimentalOptions?: AgenticContextConfiguration

    //#region Autocomplete
    autocomplete: boolean
    autocompleteLanguages: Record<string, boolean>
    autocompleteAdvancedProvider: AutocompleteProviderID | string
    autocompleteCompleteSuggestWidgetSelection?: boolean
    autocompleteFormatOnAccept?: boolean
    autocompleteDisableInsideComments: boolean

    //#region Experimental
    autocompleteExperimentalGraphContext: 'lsp-light' | 'tsc' | 'tsc-mixed' | null
    autocompleteExperimentalOllamaOptions: OllamaOptions
    autocompleteExperimentalFireworksOptions?: ExperimentalFireworksConfig

    experimentalTracing: boolean
    experimentalSupercompletions: boolean
    experimentalAutoeditsRendererTesting: boolean
    experimentalAutoeditsConfigOverride: AutoEditsModelConfig | undefined
    experimentalAutoeditsEnabled: boolean | undefined
    experimentalCommitMessage: boolean
    experimentalNoodle: boolean
    experimentalMinionAnthropicKey: string | undefined
    experimentalNoxideEnabled: boolean
    experimentalGuardrailsTimeoutSeconds: number | undefined

    //#region Unstable
    internalUnstable: boolean
    internalDebugContext?: boolean
    internalDebugState?: boolean

    //#region Hidden Settings
    hasNativeWebview: boolean
    isRunningInsideAgent?: boolean

    /**
     * @deprecated Do not use directly. Call {@link clientCapabilities} instead
     * (`clientCapabilities().agentIDE`) and see the docstring on
     * {@link ClientCapabilitiesWithLegacyFields.agentIDE}.
     */
    agentIDE?: CodyIDE

    /**
     * @deprecated Do not use directly. Call {@link clientCapabilities} instead
     * (`clientCapabilities().agentIDEVersion`) and see the docstring on
     * {@link ClientCapabilitiesWithLegacyFields.agentIDEVersion}.
     */
    agentIDEVersion?: ClientCapabilitiesWithLegacyFields['agentIDEVersion']

    /**
     * @deprecated Do not use directly. Call {@link clientCapabilities} instead
     * (`clientCapabilities().agentExtensionVersion`) and see the docstring on
     * {@link ClientCapabilitiesWithLegacyFields.agentExtensionVersion}.
     */
    agentExtensionVersion?: ClientCapabilitiesWithLegacyFields['agentExtensionVersion']

    /**
     * @deprecated Do not use directly. Call {@link clientCapabilities} instead
     * (`clientCapabilities().agentIDEVersion`) and see the docstring on
     * {@link ClientCapabilitiesWithLegacyFields.agentIDEVersion}.
     */
    telemetryClientName?: string

    agentHasPersistentStorage?: boolean
    autocompleteFirstCompletionTimeout: number
    autocompleteAdvancedModel: string | null
    providerLimitPrompt?: number
    devModels?: ChatModelProviderConfig[]

    //#region Forced Overrides
    /**
     * Overrides always take precedence over other configuration. Specific
     * override flags should be preferred over opaque broad settings /
     * environment variables such as TESTING_MODE which can make it difficult to
     * understand the broad implications such a setting can have.
     */
    overrideServerEndpoint?: string | undefined
    overrideAuthToken?: string | undefined
}

/**
 * Client configuration, such as VS Code settings.
 */
export type ClientConfiguration = ReadonlyDeep<RawClientConfiguration>

export enum CodyIDE {
    VSCode = 'VSCode',
    JetBrains = 'JetBrains',
    Neovim = 'Neovim',
    Emacs = 'Emacs',
    Web = 'Web',
    VisualStudio = 'VisualStudio',
    Eclipse = 'Eclipse',

    /**
     * The standalone web client in the Cody repository's `web/` tree.
     */
    StandaloneWeb = 'StandaloneWeb',
}

export type AutocompleteProviderID = keyof typeof AUTOCOMPLETE_PROVIDER_ID

export const AUTOCOMPLETE_PROVIDER_ID = {
    /**
     * Default identifier that maps to the recommended autocomplete provider on DotCom.
     */
    default: 'default',

    /**
     * Cody talking to Fireworks official API.
     * https://docs.fireworks.ai/api-reference/introduction
     */
    fireworks: 'fireworks',

    /**
     * Cody talking to openai compatible API.
     * We plan to use this provider instead of all the existing openai-related providers.
     */
    openaicompatible: 'openaicompatible',

    /**
     * Cody talking to OpenAI's official public API.
     * https://platform.openai.com/docs/api-reference/introduction
     */
    openai: 'openai',

    /**
     * Cody talking to OpenAI's official public API.
     * https://platform.openai.com/docs/api-reference/introduction
     *
     * @deprecated use `openai` instead
     */
    'unstable-openai': 'unstable-openai',

    /**
     * Cody talking to OpenAI through Microsoft Azure's API (they re-sell the OpenAI API, but slightly modified).
     *
     * @deprecated use `openai` instead
     */
    'azure-openai': 'azure-openai',

    /**
     * This refers to either Anthropic models re-sold by AWS,
     * or to other models hosted by AWS' Bedrock inference API service
     */
    'aws-bedrock': 'aws-bedrock',

    /**
     * Cody talking to Anthropic's official public API.
     * https://docs.anthropic.com/en/api/getting-started
     */
    anthropic: 'anthropic',

    /**
     * Cody talking to Google's APIs for models created by Google, which include:
     * - their public Gemini API
     * - their GCP Gemini API
     * - GCP Vertex API
     * - Anthropic-reselling APIs
     */
    google: 'google',

    /**
     * Cody talking to Google's APIs for models created by Google, which include:
     * - their public Gemini API
     * - their GCP Gemini API
     * - GCP Vertex API
     */
    gemini: 'gemini',

    /**
     * Cody talking to Google's APIs for models created by Google, which include:
     * - their public Gemini API
     * - their GCP Gemini API
     * - GCP Vertex API
     *
     * @deprecated use `gemini` instead.
     */
    'unstable-gemini': 'unstable-gemini',

    /**
     * Cody talking to Ollama's official public API.
     * https://ollama.ai/docs/api
     */
    'experimental-ollama': 'experimental-ollama',

    /**
     * Cody talking to Ollama's official public API.
     * https://ollama.ai/docs/api
     *
     * @deprecated use `experimental-ollama` instead.
     */
    'unstable-ollama': 'unstable-ollama',
} as const

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
    parameters?: FireworksCodeCompletionParams
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

export interface FireworksCodeCompletionParams {
    model: string | undefined
    prompt: string
    max_tokens: number
    echo: boolean
    temperature: number | undefined
    top_p: number | undefined
    top_k: number | undefined
    stop: string[]
    stream: boolean
    languageId: string
    user: string | null
}
