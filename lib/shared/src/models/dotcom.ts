import type { ModelProvider } from '.'
import { DEFAULT_CHAT_MODEL_TOKEN_LIMIT, DEFAULT_FAST_MODEL_TOKEN_LIMIT } from '../prompt/constants'
import { ModelUsage } from './types'

// The models must first be added to the custom chat models list in https://sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/internal/completions/httpapi/chat.go?L48-51
export const DEFAULT_DOT_COM_MODELS: ModelProvider[] = [
    {
        title: 'Claude 2.0',
        model: 'anthropic/claude-2.0',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        maxToken: DEFAULT_CHAT_MODEL_TOKEN_LIMIT,
    },
    {
        title: 'Claude 2.1',
        model: 'anthropic/claude-2.1',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        maxToken: DEFAULT_CHAT_MODEL_TOKEN_LIMIT,
    },
    {
        title: 'Claude Instant',
        model: 'anthropic/claude-instant-1.2',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        maxToken: DEFAULT_FAST_MODEL_TOKEN_LIMIT,
    },
    {
        title: 'Claude 3 Haiku',
        model: 'anthropic/claude-3-haiku-20240307',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        maxToken: DEFAULT_FAST_MODEL_TOKEN_LIMIT,
    },
    {
        title: 'Claude 3 Sonnet',
        model: 'anthropic/claude-3-sonnet-20240229',
        provider: 'Anthropic',
        default: true,
        codyProOnly: false,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        maxToken: DEFAULT_CHAT_MODEL_TOKEN_LIMIT,
    },
    {
        title: 'Claude 3 Opus',
        model: 'anthropic/claude-3-opus-20240229',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        maxToken: DEFAULT_CHAT_MODEL_TOKEN_LIMIT,
    },
    {
        title: 'GPT-3.5 Turbo',
        model: 'openai/gpt-3.5-turbo',
        provider: 'OpenAI',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        maxToken: DEFAULT_FAST_MODEL_TOKEN_LIMIT,
    },
    {
        title: 'GPT-4 Turbo Preview',
        model: 'openai/gpt-4-turbo-preview',
        provider: 'OpenAI',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        maxToken: DEFAULT_CHAT_MODEL_TOKEN_LIMIT,
    },
    {
        title: 'Mixtral 8x7B',
        model: 'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct',
        provider: 'Mistral',
        default: false,
        codyProOnly: true,
        // TODO: Improve prompt for Mixtral + Edit to see if we can use it there too.
        usage: [ModelUsage.Chat],
        maxToken: DEFAULT_CHAT_MODEL_TOKEN_LIMIT,
    },
] as const satisfies ModelProvider[]
