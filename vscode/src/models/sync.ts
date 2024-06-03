import {
    ANSWER_TOKENS,
    type AuthStatus,
    CHAT_INPUT_TOKEN_BUDGET,
    Model,
    ModelsService,
    ModelUsage,
    getDotComDefaultModels,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getEnterpriseContextWindow } from './utils'

/**
 * Sets the available model based on the authentication status.
 *
 * If a chat model is configured to overwrite, it will add a  provider for that model.
 * The token limit for the provider will use the configured limit,
 * or fallback to the limit from the authentication status if not configured.
 */
export function syncModels(authStatus: AuthStatus): void {
    if (!authStatus.authenticated) {
        return
    }

    // For dotcom, we use the default models.
    if (authStatus.isDotCom) {
        ModelsService.setModels(getDotComDefaultModels())
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
        ModelsService.setModels([
            new Model(
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
 * Gets an array of `Model` instances based on the configuration for dev chat models.
 * If the `cody.dev.models` setting is not configured or is empty, the function returns an empty array.
 *
 * @returns An array of `Model` instances for the configured chat models.
 */
export function getChatModelsFromConfiguration(): Model[] {
    const codyConfig = vscode.workspace.getConfiguration('cody')
    const modelsConfig = codyConfig?.get<ChatModelProviderConfig[]>('dev.models')
    if (!modelsConfig?.length) {
        return []
    }

    const models: Model[] = []
    for (const m of modelsConfig) {
        const provider = new Model(
            `${m.provider}/${m.model}`,
            [ModelUsage.Chat, ModelUsage.Edit],
            { input: m.inputTokens ?? CHAT_INPUT_TOKEN_BUDGET, output: m.outputTokens ?? ANSWER_TOKENS },
            { apiKey: m.apiKey, apiEndpoint: m.apiEndpoint }
        )
        models.push(provider)
    }

    ModelsService.addModels(models)
    return models
}
