import type { ModelProvider } from '.'
import { CHAT_TOKEN_BUDGET, FAST_CHAT_TOKEN_BUDGET, USER_CONTEXT_TOKEN_BUDGET } from '../token/constants'
import { ModelUsage } from './types'

// The models must first be added to the custom chat models list in https://sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/internal/completions/httpapi/chat.go?L48-51
const DEFAULT_DOT_COM_MODELS: ModelProvider[] = [
    {
        title: 'Claude 2.0',
        model: 'anthropic/claude-2.0',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { chat: CHAT_TOKEN_BUDGET, user: 0, enhanced: 0 },
    },
    {
        title: 'Claude 2.1',
        model: 'anthropic/claude-2.1',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { chat: CHAT_TOKEN_BUDGET, user: 0, enhanced: 0 },
    },
    {
        title: 'Claude Instant',
        model: 'anthropic/claude-instant-1.2',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { chat: FAST_CHAT_TOKEN_BUDGET, user: 0, enhanced: 0 },
    },
    {
        title: 'Claude 3 Haiku',
        model: 'anthropic/claude-3-haiku-20240307',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { chat: CHAT_TOKEN_BUDGET, user: 0, enhanced: 0 },
    },
    {
        title: 'Claude 3 Sonnet',
        model: 'anthropic/claude-3-sonnet-20240229',
        provider: 'Anthropic',
        default: true,
        codyProOnly: false,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { chat: CHAT_TOKEN_BUDGET, user: 0, enhanced: 0 },
    },
    {
        title: 'Claude 3 Opus',
        model: 'anthropic/claude-3-opus-20240229',
        provider: 'Anthropic',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { chat: CHAT_TOKEN_BUDGET, user: 0, enhanced: 0 },
    },
    {
        title: 'GPT-3.5 Turbo',
        model: 'openai/gpt-3.5-turbo',
        provider: 'OpenAI',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { chat: FAST_CHAT_TOKEN_BUDGET, user: 0, enhanced: 0 },
    },
    {
        title: 'GPT-4 Turbo',
        model: 'openai/gpt-4-turbo',
        provider: 'OpenAI',
        default: false,
        codyProOnly: true,
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { chat: CHAT_TOKEN_BUDGET, user: 0, enhanced: 0 },
    },
    {
        title: 'Mixtral 8x7B',
        model: 'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct',
        provider: 'Mistral',
        default: false,
        codyProOnly: true,
        // TODO: Improve prompt for Mixtral + Edit to see if we can use it there too.
        usage: [ModelUsage.Chat],
        contextWindow: { chat: CHAT_TOKEN_BUDGET, user: 0, enhanced: 0 },
    },
]

/**
 * NOTE: Used for A/B testing only.
 *
 * An array of model IDs that have a higher token limit than the default configured for A/B testing.
 * Used to increase the token limit for these models when the user context feature flag is enabled.
 *      Currently, only 'claude-3' (except haiku) models have a higher token limit that includes user context tokens.
 * For other models, the token limit is the same as the chat token budget, and is shared between chat and context.
 */
const modelsWithHigherLimit = ['anthropic/claude-3-sonnet-20240229', 'anthropic/claude-3-opus-20240229']

/**
 * Returns an array of `ModelProvider` objects representing the default models for the Dot Com product.
 *
 * If the `hasUserContextFeatureFlag` parameter is true, the function will return a modified array where the
 * models with higher token limits (as defined in the `modelsWithHigherLimit` array) will have their
 * `maxRequestTokens` property increased by the `USER_CONTEXT_TOKEN_BUDGET` value.
 *
 * @param hasUserContextFeatureFlag - A boolean indicating whether the user context feature flag is enabled.
 * @returns An array of `ModelProvider` objects representing the default models for the Dot Com product.
 */
export function getDotComDefaultModels(hasUserContextFeatureFlag = false): ModelProvider[] {
    return hasUserContextFeatureFlag
        ? DEFAULT_DOT_COM_MODELS.map(m =>
              modelsWithHigherLimit.includes(m.model)
                  ? {
                          ...m,
                          contextWindow: {
                              chat: CHAT_TOKEN_BUDGET,
                              user: USER_CONTEXT_TOKEN_BUDGET,
                              enhanced: 0,
                          },
                      }
                  : m
          )
        : DEFAULT_DOT_COM_MODELS
}
