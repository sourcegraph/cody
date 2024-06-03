import type { Model } from '.'
import {
    CHAT_INPUT_TOKEN_BUDGET,
    CHAT_OUTPUT_TOKEN_BUDGET,
    EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
    EXTENDED_USER_CONTEXT_TOKEN_BUDGET,
} from '../token/constants'

import { ModelUsage } from './types'
import { ModelUIGroup } from './utils'

// The models must first be added to the custom chat models list in https://sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/internal/completions/httpapi/chat.go?L48-51
export const DEFAULT_DOT_COM_MODELS = [
    // The order listed here is the order shown to users. Put the default LLM first.
    {
        title: 'Claude 3 Sonnet',
        model: 'anthropic/claude-3-sonnet-20240229',
        provider: 'Anthropic',
        default: true,
        codyProOnly: false,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        // Has a higher context window with a separate limit for user-context.
        contextWindow: {
            input: EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
            output: CHAT_OUTPUT_TOKEN_BUDGET,
            context: { user: EXTENDED_USER_CONTEXT_TOKEN_BUDGET },
        },
        deprecated: false,
        uiGroup: ModelUIGroup.Balanced,
    },
    {
        title: 'Claude 3 Opus',
        model: 'anthropic/claude-3-opus-20240229',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        // Has a higher context window with a separate limit for user-context.
        contextWindow: {
            input: EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
            output: CHAT_OUTPUT_TOKEN_BUDGET,
            context: { user: EXTENDED_USER_CONTEXT_TOKEN_BUDGET },
        },
        deprecated: false,
        uiGroup: ModelUIGroup.Accuracy,
    },
    {
        title: 'Claude 3 Haiku',
        model: 'anthropic/claude-3-haiku-20240307',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
        deprecated: false,
        uiGroup: ModelUIGroup.Speed,
    },
    {
        title: 'GPT-4o',
        model: 'openai/gpt-4o',
        provider: 'OpenAI',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        // Has a higher context window with a separate limit for user-context.
        contextWindow: {
            input: EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
            output: CHAT_OUTPUT_TOKEN_BUDGET,
            context: { user: EXTENDED_USER_CONTEXT_TOKEN_BUDGET },
        },
        deprecated: false,
        uiGroup: ModelUIGroup.Accuracy,
    },
    {
        title: 'GPT-4 Turbo',
        model: 'openai/gpt-4-turbo',
        provider: 'OpenAI',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
        deprecated: false,
        uiGroup: ModelUIGroup.Accuracy,
    },
    {
        title: 'GPT-3.5 Turbo',
        model: 'openai/gpt-3.5-turbo',
        provider: 'OpenAI',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
        deprecated: false,
        uiGroup: ModelUIGroup.Speed,
    },
    // TODO (tom) Improve prompt for Mixtral + Edit to see if we can use it there too.
    {
        title: 'Mixtral 8x7B',
        model: 'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct',
        provider: 'Mistral',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
        deprecated: false,
        uiGroup: ModelUIGroup.Speed,
    },
    {
        title: 'Mixtral 8x22B',
        model: 'fireworks/accounts/fireworks/models/mixtral-8x22b-instruct',
        provider: 'Mistral',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
        deprecated: false,
        uiGroup: ModelUIGroup.Accuracy,
    },
    // NOTE: Models soon to be deprecated.
    {
        title: 'Claude 2.0',
        model: 'anthropic/claude-2.0',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
        deprecated: true,
    },
    {
        title: 'Claude 2.1',
        model: 'anthropic/claude-2.1',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
        deprecated: true,
    },
    {
        title: 'Claude Instant',
        model: 'anthropic/claude-instant-1.2',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET },
        deprecated: true,
    },
] as const satisfies Model[]

/**
 * Returns an array of ModelProviders representing the default models for DotCom.
 *
 * @returns An array of `ModelProvider` objects.
 */
export function getDotComDefaultModels(): Model[] {
    return DEFAULT_DOT_COM_MODELS
}
