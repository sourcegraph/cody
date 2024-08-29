import {
    ANSWER_TOKENS,
    type AuthStatus,
    CHAT_INPUT_TOKEN_BUDGET,
    ClientConfigSingleton,
    FeatureFlag,
    Model,
    ModelUsage,
    RestClient,
    featureFlagProvider,
    getDotComDefaultModels,
    isDotCom,
    modelsService,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import {
    ModelsService,
    type ServerModel,
    type ServerModelConfiguration,
} from '@sourcegraph/cody-shared/src/models'
import { ModelTag } from '@sourcegraph/cody-shared/src/models/tags'
import * as vscode from 'vscode'
import { getConfiguration } from '../configuration'
import { logDebug } from '../log'
import { localStorage } from '../services/LocalStorageProvider'
import { secretStorage } from '../services/SecretStorageProvider'
import { getEnterpriseContextWindow } from './utils'

/**
 * Resets the available model based on the authentication status.
 *
 * If a chat model is configured to overwrite, it will add a provider for that model.
 * The token limit for the provider will use the configured limit,
 * or fallback to the limit from the authentication status if not configured.
 */
export async function syncModels(authStatus: AuthStatus, signal?: AbortSignal): Promise<void> {
    // If you are not authenticated, you cannot use Cody. Sorry.
    if (!authStatus.authenticated) {
        modelsService.setModels([])
        return
    }

    // Fetch the LLM models and configuration server-side. See:
    // https://linear.app/sourcegraph/project/server-side-cody-model-selection-cca47c48da6d
    const clientConfig = await ClientConfigSingleton.getInstance().getConfig(signal)
    signal?.throwIfAborted()

    if (clientConfig?.modelsAPIEnabled) {
        logDebug('ModelsService', 'new models API enabled')
        const serverSideModels = await fetchServerSideModels(authStatus.endpoint || '')
        // If the request failed, fall back to using the default models
        if (serverSideModels) {
            await modelsService.setServerSentModels({
                ...serverSideModels,
                models: maybeAdjustContextWindows(serverSideModels.models),
            })
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
    if (isDotCom(authStatus)) {
        let defaultModels = getDotComDefaultModels()
        // For users with early access or on the waitlist, replace the waitlist tag with the appropriate tags.
        const hasEarlyAccess = await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyEarlyAccess)
        const isOnWaitlist = localStorage.get(localStorage.keys.waitlist_o1)
        if (hasEarlyAccess || isOnWaitlist) {
            defaultModels = defaultModels.map(model => {
                if (model.tags.includes(ModelTag.Waitlist)) {
                    const newTags = model.tags.filter(tag => tag !== ModelTag.Waitlist)
                    newTags.push(hasEarlyAccess ? ModelTag.EarlyAccess : ModelTag.OnWaitlist)
                    return { ...model, tags: newTags }
                }
                return model
            })
            // For users with early access, remove the waitlist key.
            if (hasEarlyAccess && isOnWaitlist) {
                localStorage.delete(localStorage.keys.waitlist_o1)
            }
        }
        modelsService.setModels(defaultModels)
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
        modelsService.setModels([
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
        modelsService.setModels([])
    }
}

ModelsService.syncModels = syncModels

export async function joinModelWaitlist(authStatus: AuthStatus): Promise<void> {
    localStorage.set(localStorage.keys.waitlist_o1, true)
    await syncModels(authStatus)
    telemetryRecorder.recordEvent('cody.joinLlmWaitlist', 'clicked')
}

interface ChatModelProviderConfig {
    provider: string
    model: string
    inputTokens?: number
    outputTokens?: number
    apiKey?: string
    apiEndpoint?: string
    options?: Record<string, any>
}

/**
 * Adds any Models defined by the Visual Studio "cody.dev.models" configuration into the
 * modelsService. This provides a way to interact with models not hard-coded by default.
 *
 * NOTE: DotCom Connections only as model options are not available for Enterprise
 * BUG: This does NOT make any model changes based on the "cody.dev.useServerDefinedModels".
 */
function registerModelsFromVSCodeConfiguration(): void {
    const modelsConfig = vscode.workspace
        .getConfiguration('cody')
        .get<ChatModelProviderConfig[]>('dev.models')
    if (!modelsConfig?.length) {
        return
    }

    modelsService.addModels(
        modelsConfig.map(
            m =>
                new Model({
                    id: `${m.provider}/${m.model}`,
                    usage: [ModelUsage.Chat, ModelUsage.Edit],
                    contextWindow: {
                        input: m.inputTokens ?? CHAT_INPUT_TOKEN_BUDGET,
                        output: m.outputTokens ?? ANSWER_TOKENS,
                    },
                    clientSideConfig: {
                        apiKey: m.apiKey,
                        apiEndpoint: m.apiEndpoint,
                        options: m.options,
                    },
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

/**
 * maybeAdjustContextWindows adjusts the context window input tokens for specific models to prevent
 * context window overflow caused by token count discrepancies.
 *
 * Currently, the OpenAI tokenizer is used by default for all models. However, it often
 * counts tokens incorrectly for non-OpenAI models (e.g., Mistral), leading to over-counting
 * and potentially causing completion requests to fail due to exceeding the context window.
 *
 * The proper fix would be to use model-specific tokenizers, but this would require significant
 * refactoring. As a temporary workaround, this function reduces the `maxInputTokens` for specific
 * models to mitigate the risk of context window overflow.
 *
 * @param {ServerModel[]} models - An array of models from the site config.
 * @returns {ServerModel[]} - The array of models with adjusted context windows where applicable.
 */
export const maybeAdjustContextWindows = (models: ServerModel[]): ServerModel[] =>
    models.map(model => {
        let maxInputTokens = model.contextWindow.maxInputTokens
        if (/^mi(x|s)tral/.test(model.modelName)) {
            // Adjust the context window size for Mistral models because the OpenAI tokenizer undercounts tokens in English
            // compared to the Mistral tokenizer. Based on our observations, the OpenAI tokenizer usually undercounts by about 13%.
            // We reduce the context window by 15% (0.85 multiplier) to provide a safety buffer and prevent potential overflow.
            // Note: In other languages, the OpenAI tokenizer might actually overcount tokens. As a result, we accept the risk
            // of using a slightly smaller context window than what's available for those languages.
            maxInputTokens = Math.round(model.contextWindow.maxInputTokens * 0.85)
        }
        return { ...model, contextWindow: { ...model.contextWindow, maxInputTokens } }
    })
