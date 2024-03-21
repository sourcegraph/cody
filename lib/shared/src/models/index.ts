import { logError } from '../logger'
import { OLLAMA_DEFAULT_URL } from '../ollama'
import {
    DEFAULT_FAST_MODEL_CHARS_LIMIT,
    DEFAULT_FAST_MODEL_TOKEN_LIMIT,
    tokensToChars,
} from '../prompt/constants'
import { isDotCom } from '../sourcegraph-api/environments'
import { DEFAULT_DOT_COM_MODELS } from './dotcom'
import { ModelUsage } from './types'
import { getModelInfo } from './utils'

/**
 * ModelProvider manages available chat and edit models.
 * It stores a set of available providers and methods to add,
 * retrieve and select between them.
 */
export class ModelProvider {
    public default = false
    public codyProOnly = false
    // The name of the provider of the model, e.g. "Anthropic"
    public provider: string
    // The title of the model, e.g. "Claude 2.0"
    public readonly title: string

    constructor(
        // The model id that includes the provider name & the model name,
        // e.g. "anthropic/claude-2.0"
        public readonly model: string,
        // The usage of the model, e.g. chat or edit.
        public readonly usage: ModelUsage[],
        // The maximum number of tokens that can be processed by the model in a single request.
        // NOTE: A token is equivalent to 4 characters/bytes.
        public readonly maxToken: number = DEFAULT_FAST_MODEL_TOKEN_LIMIT
    ) {
        const { provider, title } = getModelInfo(model)
        this.provider = provider
        this.title = title
        this.default = true
    }

    /**
     * Providers available on the user's instance
     */
    private static primaryProviders: ModelProvider[] = DEFAULT_DOT_COM_MODELS
    /**
     * Providers available from local ollama instances
     */
    private static ollamaProvidersEnabled = false
    private static ollamaProviders: ModelProvider[] = []

    public static onConfigChange(enableOllamaModels: boolean): void {
        ModelProvider.ollamaProvidersEnabled = enableOllamaModels
        ModelProvider.ollamaProviders = []
        if (enableOllamaModels) {
            ModelProvider.getLocalOllamaModels()
        }
    }

    /**
     * Fetches available Ollama models from the local Ollama server
     * and adds them to the list of ollama providers.
     */
    public static getLocalOllamaModels(): void {
        const isAgentTesting = process.env.CODY_SHIM_TESTING === 'true'
        // Only fetch local models if user has enabled the config
        if (isAgentTesting || !ModelProvider.ollamaProvidersEnabled) {
            return
        }
        // TODO (bee) watch file change to determine if a new model is added
        // to eliminate the needs of restarting the extension to get the new models
        fetch(new URL('/api/tags', OLLAMA_DEFAULT_URL).href)
            .then(response => response.json())
            .then(
                data => {
                    const models = new Set<ModelProvider>()
                    for (const model of data.models) {
                        const name = `ollama/${model.model}`
                        const newModel = new ModelProvider(
                            name,
                            [ModelUsage.Chat, ModelUsage.Edit],
                            DEFAULT_FAST_MODEL_CHARS_LIMIT
                        )
                        models.add(newModel)
                    }
                    ModelProvider.ollamaProviders = Array.from(models)
                },
                error => {
                    const fetchFailedErrors = ['Failed to fetch', 'fetch failed']
                    const isFetchFailed = fetchFailedErrors.some(err => error.toString().includes(err))
                    const serverErrorMsg = 'Please make sure the Ollama server is up & running.'
                    logError('getLocalOllamaModels: failed ', isFetchFailed ? serverErrorMsg : error)
                }
            )
    }

    /**
     * Adds a new model provider, instantiated from the given model string,
     * to the internal providers set. This allows new models to be added and
     * made available for use.
     */
    public static add(provider: ModelProvider): void {
        // NOTE: private instances can only support 1 provider atm
        ModelProvider.primaryProviders = [provider]
    }

    /**
     * Gets the model providers based on the endpoint and current model.
     * If endpoint is a dotcom endpoint, returns dotComProviders with ollama providers.
     * If currentModel is provided, sets it as the default model.
     */
    public static get(
        type: ModelUsage,
        endpoint?: string | null,
        currentModel?: string
    ): ModelProvider[] {
        const isDotComUser = !endpoint || (endpoint && isDotCom(endpoint))
        if (isDotComUser) {
            ModelProvider.primaryProviders = DEFAULT_DOT_COM_MODELS
        }
        const models = ModelProvider.primaryProviders
            .concat(ModelProvider.ollamaProviders)
            .filter(model => model.usage.includes(type))

        // Set the current model as default
        return models.map(model => {
            return {
                ...model,
                default: model.model === currentModel,
            }
        })
    }

    /**
     * Finds the model provider with the given model ID and returns its characters limit.
     * The limit is calculated based on the max number of tokens the model can process.
     * E.g. 7000 tokens * 4 characters/token = 28000 characters
     */
    public static getMaxCharsByModel(modelID: string): number {
        const model = ModelProvider.primaryProviders
            .concat(ModelProvider.ollamaProviders)
            .find(m => m.model === modelID)
        return tokensToChars(model?.maxToken || DEFAULT_FAST_MODEL_TOKEN_LIMIT)
    }
}
