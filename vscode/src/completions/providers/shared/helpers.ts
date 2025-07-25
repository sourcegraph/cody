import { expect, it, vi } from 'vitest'

import {
    AUTH_STATUS_FIXTURE_AUTHED,
    type AuthenticatedAuthStatus,
    type AutocompleteProviderID,
    type CodeCompletionsParams,
    type CodyLLMSiteConfiguration,
    type ModelsData,
    createModelFromServerModel,
    firstValueFrom,
    mockAuthStatus,
    modelsService,
    parseModelRef,
    skipPendingOperation,
} from '@sourcegraph/cody-shared'

import { defaultModelPreferencesFromServerModelsConfig } from '@sourcegraph/cody-shared/src/models/sync'
import { Observable } from 'observable-fns'
import { getMockedGenerateCompletionsOptions } from '../../get-inline-completions-tests/helpers'
import { type ServerSentModelsMock, getServerSentModelsMock } from './__mocks__/create-provider-mocks'
import { createProvider } from './create-provider'
import type { Provider } from './provider'

/**
 * Creates autocomplete provider and resolves
 * to the first value emitted by the observable wrapper.
 */
async function createProviderForTest(...args: Parameters<typeof createProvider>): Promise<Provider> {
    const providerOrError = await firstValueFrom(createProvider(...args).pipe(skipPendingOperation()))

    if (providerOrError instanceof Error) {
        throw providerOrError
    }

    return providerOrError
}

/**
 * Creates autocomplete provider from the mocked VS Code settings.
 */
export function getAutocompleteProviderFromLocalSettings({
    providerId,
    legacyModel,
}: {
    providerId: AutocompleteProviderID
    legacyModel: string | null
}): Promise<Provider> {
    const authStatus = AUTH_STATUS_FIXTURE_AUTHED
    mockAuthStatus(authStatus)

    return createProviderForTest({
        config: {
            configuration: {
                autocompleteAdvancedProvider: providerId,
                autocompleteAdvancedModel: legacyModel,
            },
        },
        authStatus,
        configOverwrites: Observable.of<CodyLLMSiteConfiguration | null>(null),
    })
}

/**
 * Creates autocomplete provider from the mocked server-side model config.
 * Uses {@link modelsService} under the hood to mock the server response.
 */
export async function getAutocompleteProviderFromServerSideModelConfig({
    modelRef,
    isBYOK,
}: {
    modelRef: ServerSentModelsMock['models'][number]['modelRef']
    isBYOK: boolean
}): Promise<Provider> {
    const mockedConfig = getServerSentModelsMock()
    const newDefaultModel = mockedConfig.models.find(model => model.modelRef === modelRef)!
    mockedConfig.defaultModels.codeCompletion = newDefaultModel.modelRef

    vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
        Observable.of({
            primaryModels: mockedConfig.models.map(model => createModelFromServerModel(model, false)),
            localModels: [],
            preferences: {
                defaults: defaultModelPreferencesFromServerModelsConfig(mockedConfig),
                selected: {},
            },
        } satisfies Partial<ModelsData> as ModelsData)
    )

    const authStatus: AuthenticatedAuthStatus = AUTH_STATUS_FIXTURE_AUTHED
    mockAuthStatus(authStatus)

    return createProviderForTest({
        config: {
            configuration: {
                autocompleteAdvancedProvider: 'default',
                autocompleteAdvancedModel: null,
            },
        },
        authStatus,
        configOverwrites: Observable.of<CodyLLMSiteConfiguration | null>(
            // TODO: stop using the `configOverwrites` in combination with server-side model config.
            { provider: isBYOK ? parseModelRef(modelRef).providerId : 'sourcegraph' }
        ),
    })
}

/**
 * Creates autocomplete provider from the mocked site-config Cody LLM configuration.
 */
export function getAutocompleteProviderFromSiteConfigCodyLLMConfiguration({
    completionModel,
    provider,
}: {
    completionModel: string | undefined
    provider: AutocompleteProviderID | 'sourcegraph'
}): Promise<Provider> {
    const authStatus = AUTH_STATUS_FIXTURE_AUTHED
    mockAuthStatus(authStatus)

    vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
        Observable.of({
            primaryModels: [],
            localModels: [],
            preferences: { defaults: {}, selected: {} },
        } satisfies Partial<ModelsData> as ModelsData)
    )

    return createProviderForTest({
        config: {
            configuration: {
                autocompleteAdvancedProvider: 'default',
                autocompleteAdvancedModel: null,
            },
        },
        authStatus,
        configOverwrites: Observable.of<CodyLLMSiteConfiguration | null>({
            provider,
            completionModel,
        }),
    })
}

export interface AutocompleteProviderValuesToAssert {
    /**
     * Provider ID used for client logging.
     */
    providerId: AutocompleteProviderID
    /**
     * Legacy model used for client logging and potentially in `requestParams`
     */
    legacyModel: string
    /**
     * Payload send with HTTP requests
     */
    requestParams: Omit<CodeCompletionsParams, 'messages'>
}

/**
 * Utility to assert that the autocomplete provider is configured correctly.
 */
export function testAutocompleteProvider(
    label: string,
    valuesToAssert: AutocompleteProviderValuesToAssert,
    getProvider: () => Promise<Provider>
) {
    it.each(['enterprise'])(`[%s] ${label}`, { timeout: 500 }, async () => {
        const provider = await getProvider()
        assertProviderValues(provider, valuesToAssert)
    })
}

export function assertProviderValues(
    provider: Provider,
    valuesToAssert: AutocompleteProviderValuesToAssert
): void {
    const { providerId, legacyModel, requestParams } = valuesToAssert
    expect(provider.id).toBe(providerId)
    expect(provider.legacyModel).toBe(legacyModel)
    expect(getRequestParamsWithoutMessages(provider)).toStrictEqual(requestParams)
}

export function getRequestParamsWithoutMessages(
    provider: Provider
): Omit<CodeCompletionsParams, 'messages' | 'stopSequences'> {
    const { messages, stopSequences, ...restParams } = provider.getRequestParams(
        getMockedGenerateCompletionsOptions(provider.options)
    ) as CodeCompletionsParams

    return restParams
}
