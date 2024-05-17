import {
    ANSWER_TOKENS,
    type AuthStatus,
    CHAT_INPUT_TOKEN_BUDGET,
    CHAT_OUTPUT_TOKEN_BUDGET,
    ModelProvider,
    ModelUsage,
    getDotComDefaultModels,
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

    if (authStatus.isDotCom) {
        ModelProvider.setProviders(getDotComDefaultModels())
        getChatModelsFromConfiguration()
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
    if (!authStatus.isDotCom && authStatus?.configOverwrites?.chatModel) {
        const codyConfig = vscode.workspace.getConfiguration('cody')
        const tokenLimitConfig = codyConfig?.get<number>('provider.limit.prompt')
        const tokenLimit = tokenLimitConfig ?? authStatus.configOverwrites?.chatModelMaxTokens
        ModelProvider.setProviders([
            new ModelProvider(
                authStatus.configOverwrites.chatModel,
                // TODO: Add configOverwrites.editModel for separate edit support
                [ModelUsage.Chat, ModelUsage.Edit],

                {
                    input: tokenLimit ?? CHAT_INPUT_TOKEN_BUDGET,
                    output: getEnterpriseOutputLimit(authStatus.configOverwrites?.chatModel),
                }
            ),
        ])
    }
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
