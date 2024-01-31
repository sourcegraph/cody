import { isDotCom } from '../sourcegraph-api/environments'
import { DEFAULT_DOT_COM_EDIT_MODELS } from './edit'
import { getProviderName } from './utils'

type ModelUseCase = 'chat' | 'edit'

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
        isDefaultModel = true
    ) {
        const splittedModel = model.split('/')
        this.provider = getProviderName(splittedModel[0])
        this.title = splittedModel[1]?.replaceAll('-', ' ')
        this.default = isDefaultModel
    }

    // Providers available for non-dotcom instances
    private static privateProviders: Record<ModelUseCase, Map<string, ModelProvider>> = {
        chat: new Map(),
        edit: new Map(),
    }
    // Providers available for dotcom instances
    private static dotComProviders: Record<ModelUseCase, ModelProvider[]> = {
        chat: DEFAULT_DOT_COM_EDIT_MODELS,
        edit: DEFAULT_DOT_COM_EDIT_MODELS,
    }

    /**
     * Adds a new chat model provider, instantiated from the given model string,
     * to the internal providers set. This allows new chat models to be added and
     * made available for use.
     */
    public static add(type: ModelUseCase, provider: ModelProvider): void {
        // private instances can only support 1 provider atm
        if (ModelProvider.privateProviders[type].size) {
            ModelProvider.privateProviders[type].clear()
        }
        ModelProvider.privateProviders[type].set(provider.model.trim(), provider)
    }

    /**
     * Gets the chat model providers based on the endpoint and current model.
     * If endpoint is a dotcom endpoint, returns dotComProviders.
     * Otherwise returns providers.
     * If currentModel is provided, sets it as the default model.
     */
    public static get(
        type: ModelUseCase,
        endpoint?: string | null,
        currentModel?: string
    ): ModelProvider[] {
        const isDotComUser = !endpoint || (endpoint && isDotCom(endpoint))
        const models = isDotComUser
            ? ModelProvider.dotComProviders[type]
            : Array.from(ModelProvider.privateProviders[type].values())

        if (!isDotComUser) {
            return Array.from(ModelProvider.privateProviders[type].values())
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
