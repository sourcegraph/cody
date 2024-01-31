import type { ModelProvider } from '.'

// The models must first be added to the custom chat models list in https://sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/internal/completions/httpapi/chat.go?L48-51
export const DEFAULT_DOT_COM_CHAT_MODELS: ModelProvider[] = [
    {
        title: 'Claude 2.0',
        model: 'anthropic/claude-2.0',
        provider: 'Anthropic',
        default: true,
        codyProOnly: false,
    },
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
