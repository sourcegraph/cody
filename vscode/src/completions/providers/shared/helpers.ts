import { expect, it, vi } from 'vitest'

import {
    AUTH_STATUS_FIXTURE_AUTHED,
    AUTH_STATUS_FIXTURE_AUTHED_DOTCOM,
    type AuthenticatedAuthStatus,
    type AutocompleteProviderID,
    type CodeCompletionsParams,
    type CodyLLMSiteConfiguration,
    type ModelsData,
    type UserProductSubscription,
    createModelFromServerModel,
    firstValueFrom,
    mockAuthStatus,
    modelsService,
    parseModelRef,
    skipPendingOperation,
} from '@sourcegraph/cody-shared'

import { defaultModelPreferencesFromServerModelsConfig } from '@sourcegraph/cody-shared/src/models/sync'
import { Observable } from 'observable-fns'
import * as userProductSubscriptionModule from '../../../../../lib/shared/src/sourcegraph-api/userProductSubscription'
import { getMockedGenerateCompletionsOptions } from '../../get-inline-completions-tests/helpers'
import { type ServerSentModelsMock, getServerSentModelsMock } from './__mocks__/create-provider-mocks'
import { createProvider } from './create-provider'
import type { Provider } from './provider'

/**
 * Creates autocomplete provider and resolves
 * to the first value emitted by the observable wrapper.
 */
async function createProviderForTest(...args: Parameters<typeof createProvider>): Promise<Provider> {
    vi.spyOn(userProductSubscriptionModule, 'userProductSubscription', 'get').mockReturnValue(
        Observable.of<UserProductSubscription | null>({ userCanUpgrade: false })
    )
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
    isDotCom,
}: {
    providerId: AutocompleteProviderID
    legacyModel: string | null
    isDotCom: boolean
}): Promise<Provider> {
    const authStatus = isDotCom ? AUTH_STATUS_FIXTURE_AUTHED_DOTCOM : AUTH_STATUS_FIXTURE_AUTHED
    mockAuthStatus(authStatus)

    return createProviderForTest({
        config: {
            configuration: {
                autocompleteAdvancedProvider: providerId,
                autocompleteAdvancedModel: legacyModel,
            },
        },
        authStatus,
        configOverwrites: Observable.of<CodyLLMSiteConfiguration | null>(
            isDotCom
                ? {
                      provider: 'sourcegraph',
                      completionModel: 'fireworks/starcoder-hybrid',
                  }
                : null
        ),
    })
}

/**
 * Creates autocomplete provider from the mocked server-side model config.
 * Uses {@link modelsService} under the hood to mock the server response.
 */
export async function getAutocompleteProviderFromServerSideModelConfig({
    modelRef,
    isDotCom,
    isBYOK,
}: {
    modelRef: ServerSentModelsMock['models'][number]['modelRef']
    isDotCom: boolean
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

    const authStatus: AuthenticatedAuthStatus = isDotCom
        ? AUTH_STATUS_FIXTURE_AUTHED_DOTCOM
        : AUTH_STATUS_FIXTURE_AUTHED
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
    isDotCom,
}: {
    completionModel: string | undefined
    provider: AutocompleteProviderID | 'sourcegraph'
    isDotCom: boolean
}): Promise<Provider> {
    const authStatus = isDotCom ? AUTH_STATUS_FIXTURE_AUTHED_DOTCOM : AUTH_STATUS_FIXTURE_AUTHED
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
    getProvider: (isDotCom: boolean) => Promise<Provider>
) {
    it.each(['dotcom', 'enterprise'])(`[%s] ${label}`, { timeout: 500 }, async instanceType => {
        const provider = await getProvider(instanceType === 'dotcom')
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
