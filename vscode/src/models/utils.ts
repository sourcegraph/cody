import {
    ANSWER_TOKENS,
    type AuthStatus,
    CHAT_INPUT_TOKEN_BUDGET,
    CHAT_OUTPUT_TOKEN_BUDGET,
    type CodyLLMSiteConfiguration,
    EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
    EXTENDED_USER_CONTEXT_TOKEN_BUDGET,
    type ModelContextWindow,
    ModelProvider,
    ModelUsage,
    getDotComDefaultModels,
    logError,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

/**
 * Sets the model providers based on the authentication status.
 *
 * If a chat model is configured to overwrite, it will add a model provider for that model.
 * The token limit for the provider will use the configured limit,
 * or fallback to the limit from the authentication status if not configured.
 */
export function syncModelProviders(authStatus: AuthStatus): void {
    if (!authStatus.authenticated) {
        return
    }

    // For dotcom, we use the default models.
    if (authStatus.isDotCom) {
        ModelProvider.setProviders(getDotComDefaultModels())
        getChatModelsFromConfiguration()
        return
    }

    // In enterprise mode, we let the sg instance dictate the token limits and allow users to
    // overwrite it locally (for debugging purposes).
    //
    // This is similiar to the behavior we had before introducing the new chat and allows BYOK
    // customers to set a model of their choice without us having to map it to a known model on
    // the client.
    //
    // NOTE: If authStatus?.configOverwrites?.chatModel is empty,
    // automatically fallback to use the default model configured on the instance.
    if (authStatus?.configOverwrites?.chatModel) {
        ModelProvider.setProviders([
            new ModelProvider(
                authStatus.configOverwrites.chatModel,
                // TODO (umpox) Add configOverwrites.editModel for separate edit support
                [ModelUsage.Chat, ModelUsage.Edit],
                getEnterpriseContextWindow(
                    authStatus?.configOverwrites?.chatModel,
                    authStatus?.configOverwrites
                )
            ),
        ])
    }
}

export function getEnterpriseContextWindow(
    chatModel: string,
    configOverwrites: CodyLLMSiteConfiguration
): ModelContextWindow {
    const { chatModelMaxTokens, smartContext } = configOverwrites

    const defaultContextWindow: ModelContextWindow = {
        input: chatModelMaxTokens ?? CHAT_INPUT_TOKEN_BUDGET,
        output: getEnterpriseOutputLimit(chatModel),
    }

    if (!smartContext || !isModelWithExtendedContextWindowSupport(chatModel)) {
        return applyLocalTokenLimitOverwrite(defaultContextWindow, chatModel)
    }

    const extendedContextWindow: ModelContextWindow = {
        input: EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
        context: { user: EXTENDED_USER_CONTEXT_TOKEN_BUDGET },
        output: CHAT_OUTPUT_TOKEN_BUDGET,
    }

    return applyLocalTokenLimitOverwrite(extendedContextWindow, chatModel)
}

/**
 * Applies a local token limit overwrite to the given context window if configured.
 * If the configured limit is lower than the default, it will be applied to the input of the context window.
 * If the configured limit is invalid, an error will be logged.
 *
 * @param contextWindow The context window to apply the token limit overwrite to.
 * @param chatModel The chat model for which the token limit is being applied.
 * @returns The updated context window with the token limit overwrite applied, or the original context window if no valid overwrite is configured.
 */
function applyLocalTokenLimitOverwrite(
    contextWindow: ModelContextWindow,
    chatModel: string
): ModelContextWindow {
    const config = vscode.workspace.getConfiguration('cody')?.get<number>('provider.limit.prompt')

    // Allow users to overwrite token limit for input locally for debugging purposes if it's lower than the default.
    if (config && config <= contextWindow.input) {
        return { ...contextWindow, input: config }
    }

    if (config) {
        logError('getEnterpriseContextWindow', `Invalid token limit configured for ${chatModel}`, config)
    }

    return contextWindow
}

/**
 * Returns true if the given chat model supports extended context windows.
 *
 * @param chatModel - The name of the chat model.
 * @returns True if the chat model supports extended context windows, false otherwise.
 */
function isModelWithExtendedContextWindowSupport(chatModel: string): boolean {
    const supportedModelSubStrings = ['claude-3-opus', 'claude-3-sonnet', 'gpt-4']
    return supportedModelSubStrings.some(keyword => chatModel.includes(keyword))
}

// TODO: Currently all enterprise models have a max output limit of
// 1000. We need to support configuring the maximum output limit at an
// instance level. This will allow us to increase this limit whilst
// still supporting models with a lower output limit.
//
// To avoid Enterprise instances being stuck with low token counts, we
// will detect our recommended Cody Gateway models and Bedrock models
// and use a higher limit.
//
// See: https://github.com/sourcegrcaph/cody/issues/3648#issuecomment-2056954101
// See: https://github.com/sourcegraph/cody/pull/4203
function getEnterpriseOutputLimit(model?: string) {
    switch (model) {
        // Cody Gateway models
        case 'anthropic/claude-3-sonnet-20240229':
        case 'anthropic/claude-3-opus-20240229':
        case 'openai/gpt-4o':
        case 'openai/gpt-4-turbo':

        // Bedrock models:
        case 'anthropic.claude-3-sonnet-20240229-v1:0':
        case 'anthropic.claude-3-opus-20240229-v1:0 ':
            return CHAT_OUTPUT_TOKEN_BUDGET

        default:
            return ANSWER_TOKENS
    }
}

interface ChatModelProviderConfig {
    provider: string
    model: string
    inputTokens?: number
    outputTokens?: number
    apiKey?: string
    apiEndpoint?: string
}

/**
 * NOTE: DotCom Connections only as model options are not available for Enterprise
 *
 * Gets an array of `ModelProvider` instances based on the configuration for dev chat models.
 * If the `cody.dev.models` setting is not configured or is empty, the function returns an empty array.
 *
 * @returns An array of `ModelProvider` instances for the configured chat models.
 */
export function getChatModelsFromConfiguration(): ModelProvider[] {
    const codyConfig = vscode.workspace.getConfiguration('cody')
    const modelsConfig = codyConfig?.get<ChatModelProviderConfig[]>('dev.models')
    if (!modelsConfig?.length) {
        return []
    }

    const providers: ModelProvider[] = []
    for (const m of modelsConfig) {
        const provider = new ModelProvider(
            `${m.provider}/${m.model}`,
            [ModelUsage.Chat, ModelUsage.Edit],
            { input: m.inputTokens ?? CHAT_INPUT_TOKEN_BUDGET, output: m.outputTokens ?? ANSWER_TOKENS },
            { apiKey: m.apiKey, apiEndpoint: m.apiEndpoint }
        )
        provider.codyProOnly = true
        providers.push(provider)
    }

    ModelProvider.addProviders(providers)
    return providers
}
