import {
    ANSWER_TOKENS,
    type AuthStatus,
    CHAT_INPUT_TOKEN_BUDGET,
    Model,
    ModelUsage,
    ModelsService,
    RestClient,
    getDotComDefaultModels,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { secretStorage } from '../services/SecretStorageProvider'
import { getEnterpriseContextWindow } from './utils'

/**
 * Resets the available model based on the authentication status.
 *
 * If a chat model is configured to overwrite, it will add a provider for that model.
 * The token limit for the provider will use the configured limit,
 * or fallback to the limit from the authentication status if not configured.
 */
export async function syncModels(authStatus: AuthStatus): Promise<void> {
    // If you are not authenticated, you cannot use Cody. Sorry.
    if (!authStatus.authenticated) {
        ModelsService.setModels([])
        return
    }

    // Fetch the LLM models and configuration server-side. See:
    // https://linear.app/sourcegraph/project/server-side-cody-model-selection-cca47c48da6d
    if (useServerDefinedModels()) {
        const serverSideModels = await fetchServerSideModels(authStatus.endpoint || '')
        ModelsService.setModels(serverSideModels)
        // NOTE: We intentionally don't call `registerModelsFromVSCodeConfiguration()` here,
        // because the setting doesn't make sense. In a world where all the LLM model configuration
        // is managed server-side, there isn't any point in adding models on the client. (Since
        // the server wouldn't recognize and reject them.)
        return
    }

    // If you are connecting to Sourcegraph.com, we use the Cody Pro set of models.
    // (Only some of them may not be available if you are on the Cody Free plan.)
    if (authStatus.isDotCom) {
        ModelsService.setModels(getDotComDefaultModels())
        registerModelsFromVSCodeConfiguration()
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
    } else {
        // If the enterprise instance didn't have any configuration data for Cody,
        // clear the models available in the ModelsService. Otherwise there will be
        // stale, defunct models available.
        ModelsService.setModels([])
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
 * Adds any Models defined by the Visual Studio "cody.dev.models" configuration into the
 * ModelsService. This provides a way to interact with models not hard-coded by default.
 *
 * NOTE: DotCom Connections only as model options are not available for Enterprise
 * BUG: This does NOT make any model changes based on the "cody.dev.useServerDefinedModels".
 *
 * @returns An array of `Model` instances for the configured chat models.
 */
export function registerModelsFromVSCodeConfiguration() {
    const codyConfig = vscode.workspace.getConfiguration('cody')
    const modelsConfig = codyConfig?.get<ChatModelProviderConfig[]>('dev.models')
    if (!modelsConfig?.length) {
        return
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
}

// Checks the local VS Code configuration and sees if the user has opted into fetching
// LLM model data from the backend.
function useServerDefinedModels(): boolean {
    const codyConfig = vscode.workspace.getConfiguration('cody')
    if (codyConfig) {
        const value = codyConfig.get<boolean>('dev.useServerDefinedModels')
        if (value !== undefined) {
            return value
        }
    }
    return false
}

// fetchServerSideModels contacts the Sourcegraph endpoint, and fetches the LLM models it
// currently supports. Requires that the current user is authenticated, with their credentials
// stored.
//
// Throws an exception on any errors.
async function fetchServerSideModels(endpoint: string): Promise<Model[]> {
    if (!endpoint) {
        throw new Error('authStatus has no endpoint available. Unable to fetch models.')
    }

    // Get the user's access token, assumed to be already saved in the secret store.
    const userAccessToken = await secretStorage.getToken(endpoint)
    if (!userAccessToken) {
        throw new Error('no userAccessToken available. Unable to fetch models.')
    }

    // Fetch the data via REST API.
    // NOTE: We may end up exposing this data via GraphQL, it's still TBD.
    const client = new RestClient(endpoint, userAccessToken)
    return await client.getAvailableModels()
}
