import { OLLAMA_DEFAULT_URL } from '../ollama/ollama-client'
import { isDotCom } from '../sourcegraph-api/environments'
import { DEFAULT_DOT_COM_MODELS } from './dotcom'
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

    constructor(
        public readonly model: string,
        public readonly usage: ModelUsage[],
        isDefaultModel = true
    ) {
        const splittedModel = model.split('/')
        this.provider = getProviderName(splittedModel[0])
        this.title = splittedModel[1]?.replaceAll('-', ' ')
        this.default = isDefaultModel
    }

    // Providers available for non-dotcom instances
    private static privateProviders: Map<string, ModelProvider> = new Map()
    // Providers available for dotcom instances
    private static dotComProviders: ModelProvider[] = DEFAULT_DOT_COM_MODELS
    // Providers available from local ollama instances
    private static ollamaProviders: ModelProvider[] = []

    /**
     * Fetches available Ollama models from the local Ollama server
     * and adds them to the list of default providers.
     * The models are marked as Cody Pro only.
     */
    public static getLocalOllamaModels(): void {
        fetch(new URL('/api/tags', OLLAMA_DEFAULT_URL).href)
            .then(response => response.json())
            .then(data => {
                const models = new Set<ModelProvider>()
                for (const model of data.models) {
                    const name = `ollama/${model.model}`
                    const newModel = new ModelProvider(name, [ModelUsage.Chat])
                    models.add(newModel)
                }
                ModelProvider.ollamaProviders = Array.from(models)
            })
            .catch(() => console.log('Cannot find local ollama models'))
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
     * If endpoint is a dotcom endpoint, returns dotComProviders.
     * Otherwise returns providers.
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
                ? ModelProvider.dotComProviders.concat(ModelProvider.ollamaProviders)
                : Array.from(ModelProvider.privateProviders.values())
        ).filter(model => model.usage.includes(type))

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
}
