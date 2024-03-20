import { logError } from '../logger'
import { OLLAMA_DEFAULT_URL } from '../ollama'
import { isDotCom } from '../sourcegraph-api/environments'
import {
    DEFAULT_CHAT_MODEL_TOKEN_LIMIT,
    DEFAULT_DOT_COM_MODELS,
    DEFAULT_FAST_MODEL_TOKEN_LIMIT,
} from './dotcom'
import { ModelUsage } from './types'
import { getProviderName } from './utils'

/**
 * ModelProvider manages available chat and edit models.
 * It stores a set of available providers and methods to add,
 * retrieve and select between them.
 */
export class ModelProvider {
    public default = false
    public codyProOnly = false
    public provider: string
    public readonly title: string
    public readonly contextWindow: number

    constructor(
        public readonly model: string,
        public readonly usage: ModelUsage[],
        tokenLimit?: number
    ) {
        const splittedModel = model.split('/')
        this.provider = getProviderName(splittedModel[0])
        this.title = splittedModel[1]?.replaceAll('-', ' ')
        this.default = true
        this.contextWindow = tokenLimit ? tokenLimit * 4 : DEFAULT_FAST_MODEL_TOKEN_LIMIT
    }

    // Providers available for non-dotcom instances
    private static privateProviders: Map<string, ModelProvider> = new Map()
    // Providers available for dotcom instances
    private static dotComProviders: ModelProvider[] = DEFAULT_DOT_COM_MODELS
    // Providers available from local ollama instances
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
                        const newModel = new ModelProvider(name, [ModelUsage.Chat, ModelUsage.Edit])
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
        // private instances can only support 1 provider atm
        if (ModelProvider.privateProviders.size) {
            ModelProvider.privateProviders.clear()
        }
        ModelProvider.privateProviders.set(provider.model.trim(), provider)
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
        const models = (
            isDotComUser
                ? ModelProvider.dotComProviders
                : Array.from(ModelProvider.privateProviders.values())
        )
            .concat(ModelProvider.ollamaProviders)
            .filter(model => model.usage.includes(type))

        if (!isDotComUser) {
            return models
        }

        // Set the current model as default
        return models.map(model => {
            return {
                ...model,
                default: model.model === currentModel,
            }
        })
    }

    public static getContextWindow(modelID: string): number {
        return (
            ModelProvider.privateProviders.get(modelID)?.contextWindow ||
            ModelProvider.dotComProviders.find(model => model.model === modelID)?.contextWindow ||
            DEFAULT_CHAT_MODEL_TOKEN_LIMIT
        )
    }
}
