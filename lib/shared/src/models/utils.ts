import {
    ANSWER_TOKENS,
    CHAT_INPUT_TOKEN_BUDGET,
    CHAT_OUTPUT_TOKEN_BUDGET,
    type ClientConfiguration,
    type CodyLLMSiteConfiguration,
    EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
    EXTENDED_USER_CONTEXT_TOKEN_BUDGET,
    type ModelContextWindow,
    ModelTag,
    logDebug,
} from '..'
import type { Model } from './model'
import type { ModelRef, ModelRefStr } from './modelsService'

export function getProviderName(name: string): string {
    const providerName = name.toLowerCase()
    switch (providerName) {
        case 'anthropic':
            return 'Anthropic'
        case 'openai':
            return 'OpenAI'
        case 'ollama':
            return 'Ollama'
        case 'google':
            return 'Google'
        default:
            return providerName
    }
}

/**
 * Gets the provider and title from a model ID string.
 */
export function getModelInfo(modelID: string): {
    provider: string
    title: string
} {
    const [providerID, ...rest] = modelID.split('/')
    const provider = getProviderName(providerID)
    const title = (rest.at(-1) || '').replace(/-/g, ' ')
    return { provider, title }
}

export function isCodyProModel(model: Model): boolean {
    return modelHasTag(model, ModelTag.Pro)
}

export function isWaitlistModel(model: Model): boolean {
    return modelHasTag(model, ModelTag.Waitlist) || modelHasTag(model, ModelTag.OnWaitlist)
}

export function isCustomModel(model: Model): boolean {
    return (
        modelHasTag(model, ModelTag.Local) ||
        modelHasTag(model, ModelTag.Dev) ||
        modelHasTag(model, ModelTag.BYOK)
    )
}

function modelHasTag(model: Model, modelTag: ModelTag): boolean {
    return model.tags.includes(modelTag)
}

export function toModelRefStr(modelRef: ModelRef): ModelRefStr {
    const { providerId, apiVersionId, modelId } = modelRef
    return `${providerId}::${apiVersionId}::${modelId}`
}

/**
 * Get the context window for the given chat model and configuration overwrites in an enterprise environment.
 *
 * @param chatModel - The chat model to get the context window for.
 * @param configOverwrites - The configuration overwrites to apply.
 * @returns The context window for the given chat model and configuration overwrites.
 */
export function getEnterpriseContextWindow(
    chatModel: string,
    configOverwrites: CodyLLMSiteConfiguration,
    configuration: Pick<ClientConfiguration, 'providerLimitPrompt'>
): ModelContextWindow {
    const { chatModelMaxTokens, smartContextWindow } = configOverwrites
    // Starts with the default context window.
    let contextWindow: ModelContextWindow = {
        input: chatModelMaxTokens ?? CHAT_INPUT_TOKEN_BUDGET,
        output: getEnterpriseOutputLimit(chatModel),
    }

    // Use extended context window for models that support smart context when enabled.
    if (smartContextWindow && isModelWithExtendedContextWindowSupport(chatModel)) {
        contextWindow = {
            input: EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
            output: CHAT_OUTPUT_TOKEN_BUDGET,
            context: { user: EXTENDED_USER_CONTEXT_TOKEN_BUDGET },
        }
    }

    return applyLocalTokenLimitOverwrite(configuration, chatModel, contextWindow)
}

/**
 * Applies a local token limit overwrite to the given context window if configured.
 * If the configured limit is lower than the default, it will be applied to the input of the context window.
 * If the configured limit is invalid, an error will be logged.
 *
 * @param chatModel The chat model for which the token limit is being applied.
 * @param contextWindow The context window to apply the token limit overwrite to.
 * @returns The updated context window with the token limit overwrite applied, or the original context window if no valid overwrite is configured.
 */
function applyLocalTokenLimitOverwrite(
    { providerLimitPrompt }: Pick<ClientConfiguration, 'providerLimitPrompt'>,
    chatModel: string,
    contextWindow: ModelContextWindow
): ModelContextWindow {
    if (providerLimitPrompt && providerLimitPrompt <= contextWindow.input) {
        return { ...contextWindow, input: providerLimitPrompt }
    }

    if (providerLimitPrompt) {
        logDebug(
            'getEnterpriseContextWindow',
            `Invalid token limit configured for ${chatModel}`,
            providerLimitPrompt
        )
    }

    return contextWindow
}

/**
 * Returns true if the given chat model supports extended context windows.
 *
 * @param chatModel - The name of the chat model.
 * @returns True if the chat model supports extended context windows, false otherwise.
 */
const modelWithExpandedWindowSubStrings = [
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-5-sonnet',
    'gemini-1.5',
    'gpt-4o',
    'gpt-4-turbo',
]
function isModelWithExtendedContextWindowSupport(chatModel: string): boolean {
    return modelWithExpandedWindowSubStrings.some(keyword => chatModel.toLowerCase().includes(keyword))
}

// TODO: Currently all enterprise models have a max output limit of
// 1000. We need to support configuring the maximum output limit at an
// instance level. This will allow us to increase this limit whilst
// still supporting models with a lower output limit.
//
// To avoid Enterprise instances being stuck with low token counts, we
// will detect our recommended Cody Gateway models to use a higher limit.
//
// See: https://github.com/sourcegrcaph/cody/issues/3648#issuecomment-2056954101
// See: https://github.com/sourcegraph/cody/pull/4203
function getEnterpriseOutputLimit(model?: string) {
    if (model && isModelWithExtendedContextWindowSupport(model)) {
        return CHAT_OUTPUT_TOKEN_BUDGET
    }
    return ANSWER_TOKENS
}
