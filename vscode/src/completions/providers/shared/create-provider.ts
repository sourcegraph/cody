import { Observable, map } from 'observable-fns'

import {
    AUTOCOMPLETE_PROVIDER_ID,
    type AuthenticatedAuthStatus,
    type AutocompleteProviderID,
    type Model,
    ModelUsage,
    type PickResolvedConfiguration,
    isDotComAuthed,
    modelsService,
    pendingOperation,
    switchMapReplayOperation,
} from '@sourcegraph/cody-shared'

import { createProvider as createAnthropicProvider } from '../anthropic'
import { createProvider as createExperimentalOllamaProvider } from '../experimental-ollama'
import { createProvider as createExperimentalOpenAICompatibleProvider } from '../expopenaicompatible'
import { createProvider as createFireworksProvider } from '../fireworks'
import { createProvider as createGeminiProviderConfig } from '../google'
import { createProvider as createOpenAICompatibleProviderConfig } from '../openaicompatible'
import { createProvider as createUnstableOpenAIProviderConfig } from '../unstable-openai'

import { getDotComExperimentModel } from './get-experiment-model'
import { parseProviderAndModel } from './parse-provider-and-model'
import type { Provider, ProviderFactory } from './provider'

export function createProvider({
    config: { configuration },
    authStatus,
}: {
    config: PickResolvedConfiguration<{
        configuration: 'autocompleteAdvancedModel' | 'autocompleteAdvancedProvider'
    }>
    authStatus: Pick<AuthenticatedAuthStatus, 'endpoint' | 'configOverwrites'>
}): Observable<Provider | typeof pendingOperation | Error> {
    // Resolve the provider config from the VS Code config.
    if (
        configuration.autocompleteAdvancedProvider &&
        configuration.autocompleteAdvancedProvider !== 'default'
    ) {
        return Observable.of(
            createProviderHelper({
                legacyModel: configuration.autocompleteAdvancedModel || undefined,
                provider: configuration.autocompleteAdvancedProvider,
                source: 'local-editor-settings',
                authStatus,
            })
        )
    }

    return getDotComExperimentModel({ authStatus }).pipe(
        switchMapReplayOperation(dotComExperiment => {
            // Check if a user participates in autocomplete experiments.
            if (dotComExperiment) {
                return Observable.of(
                    createProviderHelper({
                        legacyModel: dotComExperiment.model,
                        provider: dotComExperiment.provider,
                        source: 'dotcom-feature-flags',
                        authStatus,
                    })
                )
            }

            return modelsService.getDefaultModel(ModelUsage.Autocomplete).pipe(
                map(model => {
                    if (model === pendingOperation) {
                        return pendingOperation
                    }

                    // Check if server-side model configuration is available.
                    if (model) {
                        const provider = model.clientSideConfig?.openAICompatible
                            ? 'openaicompatible'
                            : model.provider

                        return createProviderHelper({
                            legacyModel: model.id,
                            model,
                            provider,
                            source: 'server-side-model-config',
                            authStatus,
                        })
                    }

                    // Fallback to site-config Cody LLM configuration.
                    const { configOverwrites } = authStatus

                    if (configOverwrites?.provider) {
                        const parsedProviderAndModel = parseProviderAndModel({
                            provider: configOverwrites.provider,
                            legacyModel: configOverwrites.completionModel,
                        })

                        if (parsedProviderAndModel instanceof Error) {
                            return parsedProviderAndModel
                        }

                        return createProviderHelper({
                            legacyModel: parsedProviderAndModel.legacyModel,
                            provider: parsedProviderAndModel.provider,
                            source: 'site-config-cody-llm-configuration',
                            authStatus,
                        })
                    }

                    return new Error(
                        'Failed to create autocomplete provider. Please configure the `completionModel` using site configuration.'
                    )
                })
            )
        })
    )
}

interface CreateProviderHelperParams {
    legacyModel: string | undefined
    provider: string

    model?: Model
    source: AutocompleteProviderConfigSource

    authStatus: Pick<AuthenticatedAuthStatus, 'endpoint' | 'configOverwrites'>
}

function createProviderHelper(params: CreateProviderHelperParams): Provider | Error {
    const { legacyModel, model, provider, source, authStatus } = params

    const providerCreator = getProviderCreator({
        provider: provider as AutocompleteProviderID,
        authStatus,
    })

    if (providerCreator) {
        return providerCreator({
            model,
            legacyModel: legacyModel,
            provider: provider as AutocompleteProviderID,
            source,
            authStatus,
        })
    }

    const sourceDependentMessage =
        source === 'local-editor-settings'
            ? 'Please check your local "cody.autocomplete.advanced.provider" setting.'
            : isDotComAuthed()
              ? 'Please report the issue using the "Cody Debug: Report Issue" VS Code command.'
              : 'Please check your site configuration for autocomplete: https://sourcegraph.com/docs/cody/capabilities/autocomplete.'

    return new Error(
        `Failed to create "${provider}" autocomplete provider derived from "${source}". ${sourceDependentMessage}`
    )
}

interface GetProviderCreatorParams {
    provider: AutocompleteProviderID
    authStatus: Pick<AuthenticatedAuthStatus, 'configOverwrites'>
}

function getProviderCreator(params: GetProviderCreatorParams): ProviderFactory | null {
    const { provider, authStatus } = params

    if (
        provider === AUTOCOMPLETE_PROVIDER_ID.default ||
        provider === AUTOCOMPLETE_PROVIDER_ID.fireworks
    ) {
        return createFireworksProvider
    }

    if (provider === AUTOCOMPLETE_PROVIDER_ID.openaicompatible) {
        return createOpenAICompatibleProviderConfig
    }

    if (
        provider === AUTOCOMPLETE_PROVIDER_ID.openai ||
        provider === AUTOCOMPLETE_PROVIDER_ID['unstable-openai'] ||
        provider === AUTOCOMPLETE_PROVIDER_ID['azure-openai']
    ) {
        return createUnstableOpenAIProviderConfig
    }

    if (provider === AUTOCOMPLETE_PROVIDER_ID['experimental-openaicompatible']) {
        return createExperimentalOpenAICompatibleProvider
    }

    const { configOverwrites } = authStatus

    if (
        provider === AUTOCOMPLETE_PROVIDER_ID.anthropic ||
        provider === AUTOCOMPLETE_PROVIDER_ID['aws-bedrock'] ||
        // An exception where we have to check the completion model string in addition to the provider ID.
        (provider === AUTOCOMPLETE_PROVIDER_ID.google &&
            configOverwrites?.completionModel?.includes('claude'))
    ) {
        return createAnthropicProvider
    }

    if (
        provider === AUTOCOMPLETE_PROVIDER_ID.google ||
        provider === AUTOCOMPLETE_PROVIDER_ID.gemini ||
        provider === AUTOCOMPLETE_PROVIDER_ID['unstable-gemini']
    ) {
        return createGeminiProviderConfig
    }

    if (
        provider === AUTOCOMPLETE_PROVIDER_ID['experimental-ollama'] ||
        provider === AUTOCOMPLETE_PROVIDER_ID['unstable-ollama']
    ) {
        return createExperimentalOllamaProvider
    }

    return null
}

/**
 * Config sources are listed in the order of precedence.
 */
const AUTOCOMPLETE_PROVIDER_CONFIG_SOURCE = {
    /**
     * Local user configuration. Used to switch from the remote default to ollama and potentially other local providers.
     */
    'local-editor-settings': 'local-editor-settings',

    /**
     * Used only on DotCom for A/B testing new models.
     */
    'dotcom-feature-flags': 'dotcom-feature-flags',

    /**
     * The server-side models configuration API we intend to migrate to. Currently used only by a handful of enterprise customers.
     * See {@link RestClient.getAvailableModels} for more details.
     */
    'server-side-model-config': 'server-side-model-config',

    /**
     * The old way of configuring models.
     * See {@link SourcegraphGraphQLAPIClient.getCodyLLMConfiguration} for more details.
     */
    'site-config-cody-llm-configuration': 'site-config-cody-llm-configuration',
} as const

export type AutocompleteProviderConfigSource = keyof typeof AUTOCOMPLETE_PROVIDER_CONFIG_SOURCE
