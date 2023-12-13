import { isDotCom } from '../sourcegraph-api/environments'

// The allowed chat models for dotcom
// The models must first be added to the custom chat models list in https://sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/internal/completions/httpapi/chat.go?L48-51
const defaultDotComChatModels: ChatModelProvider[] = [
    { title: 'Claude 2.0', model: 'anthropic/claude-2.0', provider: 'Anthropic', default: true, codyProOnly: false },
    {
        title: 'Claude 2.1 Preview',
        model: 'anthropic/claude-2.1',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
    },
    {
        title: 'Claude Instant',
        model: 'anthropic/claude-instant-1.2',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
    },
    {
        title: 'ChatGPT 3.5 Turbo',
        model: 'openai/gpt-3.5-turbo',
        provider: 'OpenAI',
        default: false,
        codyProOnly: true,
    },
    {
        title: 'ChatGPT 4 Turbo Preview',
        model: 'openai/gpt-4-1106-preview',
        provider: 'OpenAI',
        default: false,
        codyProOnly: true,
    },
    {
        title: 'Mixtral 8x7B',
        model: 'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct',
        provider: 'Mistral',
        default: false,
        codyProOnly: true,
    },
]

/**
 * ChatModelProvider manages available chat models.
 * It stores a set of available providers and methods to add,
 * retrieve and select between them.
 */
export class ChatModelProvider {
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
    private static privateProviders: Map<string, ChatModelProvider> = new Map()
    // Providers available for dotcom instances
    private static dotComProviders: ChatModelProvider[] = defaultDotComChatModels

    /**
     * Adds a new chat model provider, instantiated from the given model string,
     * to the internal providers set. This allows new chat models to be added and
     * made available for use.
     */
    public static add(provider: ChatModelProvider): void {
        // private instances can only support 1 provider atm
        if (this.privateProviders.size) {
            this.privateProviders.clear()
        }
        this.privateProviders.set(provider.model.trim(), provider)
    }

    /**
     * Gets the chat model providers based on the endpoint and current model.
     * If endpoint is a dotcom endpoint, returns dotComProviders.
     * Otherwise returns providers.
     * If currentModel is provided, sets it as the default model.
     */
    public static get(endpoint?: string | null, currentModel?: string): ChatModelProvider[] {
        const isDotComUser = !endpoint || (endpoint && isDotCom(endpoint))
        const models = isDotComUser ? this.dotComProviders : Array.from(this.privateProviders.values())

        if (!isDotComUser) {
            return Array.from(this.privateProviders.values())
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

function getProviderName(name: string): string {
    const providerName = name.toLowerCase()
    switch (providerName) {
        case 'anthropic':
            return 'Anthropic'
        case 'openai':
            return 'OpenAI'
        default:
            return providerName
    }
}
