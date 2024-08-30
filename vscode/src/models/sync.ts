import {
    ANSWER_TOKENS,
    type AuthStatus,
    CHAT_INPUT_TOKEN_BUDGET,
    ClientConfigSingleton,
    Model,
    ModelUsage,
    RestClient,
    getDotComDefaultModels,
    modelsService,
} from '@sourcegraph/cody-shared'
import type { ServerModelConfiguration } from '@sourcegraph/cody-shared/src/models'
import { ModelTag } from '@sourcegraph/cody-shared/src/models/tags'
import * as vscode from 'vscode'
import { getConfiguration } from '../configuration'
import { logDebug } from '../log'
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
    // Offline mode only support Ollama models, which would be synced seperately.
    modelsService.instance!.setAuthStatus(authStatus)
    if (authStatus.isOfflineMode) {
        modelsService.instance!.setModels([])
        return
    }

    // If you are not authenticated, you cannot use Cody. Sorry.
    if (!authStatus.authenticated) {
        modelsService.instance!.setModels([])
        return
    }

    // Fetch the LLM models and configuration server-side. See:
    // https://linear.app/sourcegraph/project/server-side-cody-model-selection-cca47c48da6d
    const clientConfig = await ClientConfigSingleton.getInstance().getConfig()

    if (clientConfig?.modelsAPIEnabled) {
        logDebug('ModelsService', 'new models API enabled')
        const serverSideModels = await fetchServerSideModels(authStatus.endpoint || '')
        // If the request failed, fall back to using the default models
        if (serverSideModels) {
            modelsService.instance!.setServerSentModels(serverSideModels)
            // NOTE: Calling `registerModelsFromVSCodeConfiguration()` doesn't entirely make sense in
            // a world where LLM models are managed server-side. However, this is how Cody can be extended
            // to use locally running LLMs such as Ollama. (Though some more testing is needed.)
            // See: https://sourcegraph.com/blog/local-code-completion-with-ollama-and-cody
            registerModelsFromVSCodeConfiguration()
            return
        }
    }

    // If you are connecting to Sourcegraph.com, we use the Cody Pro set of models.
    // (Only some of them may not be available if you are on the Cody Free plan.)
    if (authStatus.isDotCom) {
        modelsService.instance!.setModels(getDotComDefaultModels())
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
        modelsService.instance!.setModels([
            new Model({
                id: authStatus.configOverwrites.chatModel,
                // TODO (umpox) Add configOverwrites.editModel for separate edit support
                usage: [ModelUsage.Chat, ModelUsage.Edit],
                contextWindow: getEnterpriseContextWindow(
                    authStatus?.configOverwrites?.chatModel,
                    authStatus?.configOverwrites
                ),
                tags: [ModelTag.Enterprise],
            }),
        ])
    } else {
        // If the enterprise instance didn't have any configuration data for Cody,
        // clear the models available in the modelsService. Otherwise there will be
        // stale, defunct models available.
        modelsService.instance!.setModels([])
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
 * modelsService. This provides a way to interact with models not hard-coded by default.
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

    modelsService.instance!.addModels(
        modelsConfig.map(
            m =>
                new Model({
                    id: `${m.provider}/${m.model}`,
                    usage: [ModelUsage.Chat, ModelUsage.Edit],
                    contextWindow: {
                        input: m.inputTokens ?? CHAT_INPUT_TOKEN_BUDGET,
                        output: m.outputTokens ?? ANSWER_TOKENS,
                    },
                    clientSideConfig: { apiKey: m.apiKey, apiEndpoint: m.apiEndpoint },
                    tags: [ModelTag.Local, ModelTag.BYOK, ModelTag.Experimental],
                })
        )
    )
}

// fetchServerSideModels contacts the Sourcegraph endpoint, and fetches the LLM models it
// currently supports. Requires that the current user is authenticated, with their credentials
// stored.
//
// Throws an exception on any errors.
async function fetchServerSideModels(endpoint: string): Promise<ServerModelConfiguration | undefined> {
    if (!endpoint) {
        throw new Error('authStatus has no endpoint available. Unable to fetch models.')
    }

    // Get the user's access token, assumed to be already saved in the secret store.
    const userAccessToken = await secretStorage.getToken(endpoint)
    const customHeaders = getConfiguration().customHeaders

    // Fetch the data via REST API.
    // NOTE: We may end up exposing this data via GraphQL, it's still TBD.
    const client = new RestClient(endpoint, userAccessToken, customHeaders)
    return await client.getAvailableModels()
}
