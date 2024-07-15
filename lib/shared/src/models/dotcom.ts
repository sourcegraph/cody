import type { Model } from '.'
import {
    CHAT_INPUT_TOKEN_BUDGET,
    CHAT_OUTPUT_TOKEN_BUDGET,
    CHAT_OUTPUT_TOKEN_BUDGET_3_5_SONNET,
    EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
    EXTENDED_USER_CONTEXT_TOKEN_BUDGET,
} from '../token/constants'
import { ModelTag } from './tags'

import { type ModelContextWindow, ModelUsage } from './types'

const basicContextWindow: ModelContextWindow = {
    input: CHAT_INPUT_TOKEN_BUDGET,
    output: CHAT_OUTPUT_TOKEN_BUDGET,
}

/**
 * Has a higher context window with a separate limit for user-context.
 */
const expandedContextWindow: ModelContextWindow = {
    input: EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
    output: CHAT_OUTPUT_TOKEN_BUDGET,
    context: { user: EXTENDED_USER_CONTEXT_TOKEN_BUDGET },
}

/**
 * Has a larger chat output limit for Claude 3.5 Sonnet only
 */
const expandedContextWindow3_5_Sonnet: ModelContextWindow = {
    input: EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
    output: CHAT_OUTPUT_TOKEN_BUDGET_3_5_SONNET,
    context: { user: EXTENDED_USER_CONTEXT_TOKEN_BUDGET },
}

/**
 * Returns an array of Models representing the default models for DotCom.
 * The order listed here is the order shown to users. Put the default LLM first.
 *
 * NOTE: The models MUST first be added to the custom chat models list in Cody Gateway.
 * @link https://sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/internal/completions/httpapi/chat.go?L48-51
 *
 * @returns An array of `Models` objects.
 * @deprecated This will be replaced with server-sent models
 */
export const DEFAULT_DOT_COM_MODELS = [
    // --------------------------------
    // Anthropic models
    // --------------------------------
    {
        title: 'Claude 3.5 Sonnet',
        model: 'anthropic/claude-3-5-sonnet-20240620',
        provider: 'Anthropic',
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: expandedContextWindow3_5_Sonnet,
        tags: [ModelTag.Gateway, ModelTag.Accuracy, ModelTag.Recommended, ModelTag.Free],
    },
    {
        title: 'Claude 3 Sonnet',
        model: 'anthropic/claude-3-sonnet-20240229',
        provider: 'Anthropic',
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: expandedContextWindow,
        tags: [ModelTag.Gateway, ModelTag.Recommended, ModelTag.Balanced],
    },
    {
        title: 'Claude 3 Opus',
        model: 'anthropic/claude-3-opus-20240229',
        provider: 'Anthropic',
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: expandedContextWindow,
        tags: [ModelTag.Gateway, ModelTag.Pro, ModelTag.Recommended, ModelTag.Accuracy],
    },
    {
        title: 'Claude 3 Haiku',
        model: 'anthropic/claude-3-haiku-20240307',
        provider: 'Anthropic',
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: basicContextWindow,
        tags: [ModelTag.Gateway, ModelTag.Speed],
    },

    // --------------------------------
    // OpenAI models
    // --------------------------------
    {
        title: 'GPT-4o',
        model: 'openai/gpt-4o',
        provider: 'OpenAI',
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: expandedContextWindow,
        tags: [ModelTag.Gateway, ModelTag.Pro, ModelTag.Recommended, ModelTag.Accuracy],
    },
    {
        title: 'GPT-4 Turbo',
        model: 'openai/gpt-4-turbo',
        provider: 'OpenAI',
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: basicContextWindow,
        tags: [ModelTag.Gateway, ModelTag.Pro, ModelTag.Balanced],
    },
    {
        title: 'GPT-3.5 Turbo',
        model: 'openai/gpt-3.5-turbo',
        provider: 'OpenAI',
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: basicContextWindow,
        tags: [ModelTag.Gateway, ModelTag.Speed],
    },

    // --------------------------------
    // Google models
    // --------------------------------
    {
        title: 'Gemini 1.5 Pro',
        model: 'google/gemini-1.5-pro-latest',
        provider: 'Google',
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: expandedContextWindow,
        tags: [ModelTag.Gateway, ModelTag.Accuracy],
    },
    {
        title: 'Gemini 1.5 Flash',
        model: 'google/gemini-1.5-flash-latest',
        provider: 'Google',
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: expandedContextWindow,
        tags: [ModelTag.Gateway, ModelTag.Speed],
    },

    // TODO (tom) Improve prompt for Mixtral + Edit to see if we can use it there too.
    {
        title: 'Mixtral 8x7B',
        model: 'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct',
        provider: 'Mistral',
        usage: [ModelUsage.Chat],
        contextWindow: basicContextWindow,
        tags: [ModelTag.Gateway, ModelTag.Speed],
    },
    {
        title: 'Mixtral 8x22B',
        model: 'fireworks/accounts/fireworks/models/mixtral-8x22b-instruct',
        provider: 'Mistral',
        usage: [ModelUsage.Chat],
        contextWindow: basicContextWindow,
        tags: [ModelTag.Gateway, ModelTag.Accuracy],
    },
] as const satisfies Model[]

/**
 * Returns an array of Models representing the default models for DotCom.
 *
 * @returns An array of `Models` objects.
 * @deprecated This will be replaced with server-sent models
 */
export function getDotComDefaultModels(): Model[] {
    return DEFAULT_DOT_COM_MODELS
}
