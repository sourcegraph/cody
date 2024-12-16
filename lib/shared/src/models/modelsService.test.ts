import { Observable } from 'observable-fns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentAuthStatus, mockAuthStatus } from '../auth/authStatus'
import { AUTH_STATUS_FIXTURE_AUTHED, type AuthenticatedAuthStatus } from '../auth/types'
import { FeatureFlag, featureFlagProvider } from '../experimentation/FeatureFlagProvider'
import { firstValueFrom } from '../misc/observable'
import { DOTCOM_URL } from '../sourcegraph-api/environments'
import * as userProductSubscriptionModule from '../sourcegraph-api/userProductSubscription'
import type { UserProductSubscription } from '../sourcegraph-api/userProductSubscription'
import { CHAT_INPUT_TOKEN_BUDGET, CHAT_OUTPUT_TOKEN_BUDGET } from '../token/constants'
import { getMockedDotComClientModels } from './dotcom'
import type { Model } from './model'
import { createModel } from './model'
import { type ModelsData, ModelsService, TestLocalStorageForModelPreferences } from './modelsService'
import { ModelTag } from './tags'
import { ModelUsage } from './types'

const EMPTY_MODELS_DATA: ModelsData = {
    localModels: [],
    preferences: { defaults: {}, selected: {} },
    primaryModels: [],
}

describe('modelsService', () => {
    function modelsServiceWithModels(models: Model[]): ModelsService {
        const modelsService = new ModelsService()
        storage = new TestLocalStorageForModelPreferences()
        modelsService.setStorage(storage)
        // TODO(sqs)#observe: this only mocks tests that don't use modelsService.modelsChanges
        vi.spyOn(modelsService, 'models', 'get').mockReturnValue(models)
        return modelsService
    }

    const freeUserAuthStatus: AuthenticatedAuthStatus = {
        ...AUTH_STATUS_FIXTURE_AUTHED,
        endpoint: DOTCOM_URL.toString(),
        authenticated: true,
    }
    const freeUserSub: UserProductSubscription = {
        userCanUpgrade: true,
    }

    const codyProAuthStatus: AuthenticatedAuthStatus = {
        ...freeUserAuthStatus,
    }
    const codyProSub: UserProductSubscription = {
        userCanUpgrade: false,
    }

    const enterpriseAuthStatus: AuthenticatedAuthStatus = {
        ...AUTH_STATUS_FIXTURE_AUTHED,
        endpoint: 'https://sourcegraph.example.com',
    }

    // Reset service
    let modelsService: ModelsService
    let storage: TestLocalStorageForModelPreferences
    beforeEach(() => {
        modelsService = new ModelsService()
    })
    afterEach(() => {
        modelsService.dispose()
    })

    describe('getContextWindowByID', () => {
        it('returns default token limit for unknown model', () => {
            const max = modelsService.getContextWindowByID('unknown-model')
            expect(max).toEqual({ input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET })
        })

        it('returns max token limit for known DotCom chat model ', () => {
            const models = getMockedDotComClientModels()
            const modelsService = modelsServiceWithModels(models)
            expect(models[0].id).toBeDefined()
            const cw = modelsService.getContextWindowByID(models[0].id)
            expect(cw).toStrictEqual(models[0].contextWindow)
        })

        it('returns max token limit for known DotCom chat model with higher context window (claude 3)', () => {
            const models = getMockedDotComClientModels()
            const modelsService = modelsServiceWithModels(models)
            const claude3SonnetSubString = 'claude-3-5-sonnet-latest'
            const claude3SonnetModel = modelsService.getModelByIDSubstringOrError(claude3SonnetSubString)
            expect(claude3SonnetModel?.contextWindow?.context?.user).greaterThan(0)
            expect(claude3SonnetModel).toBeDefined()
            const cw = modelsService.getContextWindowByID(claude3SonnetModel.id)
            expect(cw).toEqual(claude3SonnetModel?.contextWindow)
        })

        it('returns default token limit for unknown model - Enterprise user', () => {
            const cw = modelsService.getContextWindowByID('unknown-model')
            expect(cw).toEqual({ input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET })
        })

        it('returns max token limit for known model - Enterprise user', () => {
            const modelsService = modelsServiceWithModels([
                createModel({
                    id: 'enterprise-model',
                    usage: [ModelUsage.Chat],
                    contextWindow: { input: 200, output: 100 },
                }),
            ])
            const cw = modelsService.getContextWindowByID('enterprise-model')
            expect(cw.input).toEqual(200)
        })
    })

    describe('getMaxOutputCharsByModel', () => {
        it('returns default token limit for unknown model', () => {
            const { output } = modelsService.getContextWindowByID('unknown-model')
            expect(output).toEqual(CHAT_OUTPUT_TOKEN_BUDGET)
        })

        it('returns max token limit for known chat model', () => {
            const models = getMockedDotComClientModels()
            const modelsService = modelsServiceWithModels(models)
            const knownModel = models[0]
            const { output } = modelsService.getContextWindowByID(knownModel.id)
            expect(output).toEqual(knownModel.contextWindow.output)
        })

        it('returns default token limit for unknown model - Enterprise user', () => {
            const { output } = modelsService.getContextWindowByID('unknown-model')
            expect(output).toEqual(CHAT_OUTPUT_TOKEN_BUDGET)
        })

        it('returns max token limit for known model - Enterprise user', () => {
            const modelsService = modelsServiceWithModels([
                createModel({
                    id: 'model-with-limit',
                    usage: [ModelUsage.Chat],
                    contextWindow: { input: 8000, output: 2000 },
                }),
            ])
            const { output } = modelsService.getContextWindowByID('model-with-limit')
            expect(output).toEqual(2000)
        })
    })

    describe('Selected models', () => {
        const model1chat = createModel({
            id: 'model-1',
            usage: [ModelUsage.Chat],
        })

        const model2chat = createModel({
            id: 'model-2',
            usage: [ModelUsage.Chat],
        })

        const model3all = createModel({
            id: 'model-3',
            usage: [ModelUsage.Chat, ModelUsage.Edit],
        })

        const model4edit = createModel({
            id: 'model-4',
            usage: [ModelUsage.Edit],
        })

        function modelsServiceWithModels(models: Model[]): ModelsService {
            const modelsService = new ModelsService()
            modelsService.setStorage(new TestLocalStorageForModelPreferences())
            return modelsService
        }

        let modelsService: ModelsService
        beforeEach(() => {
            mockAuthStatus(codyProAuthStatus)
            vi.spyOn(userProductSubscriptionModule, 'userProductSubscription', 'get').mockReturnValue(
                Observable.of(codyProSub)
            )
            modelsService = modelsServiceWithModels([model1chat, model2chat, model3all, model4edit])
        })

        it('allows setting default models per type', async () => {
            vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
                Observable.of(EMPTY_MODELS_DATA)
            )
            await modelsService.setSelectedModel(ModelUsage.Chat, model2chat)
            await modelsService.setSelectedModel(ModelUsage.Edit, model4edit)

            vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
                Observable.of({
                    localModels: [],
                    primaryModels: [model2chat, model4edit],
                    preferences: storage?.getModelPreferences()[currentAuthStatus().endpoint]!,
                })
            )
            expect(await firstValueFrom(modelsService.getDefaultEditModel())).toBe(model4edit.id)
            expect(await firstValueFrom(modelsService.getDefaultChatModel())).toBe(model2chat.id)
        })

        it('only allows setting known models as default', async () => {
            // Set default before settings models is a no-op
            vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
                Observable.of(EMPTY_MODELS_DATA)
            )
            await expect(
                modelsService.setSelectedModel(ModelUsage.Chat, model2chat.id)
            ).rejects.toThrowError('Model not found: model-2')
            vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
                Observable.of({
                    ...EMPTY_MODELS_DATA,
                    primaryModels: [model1chat],
                    preferences: storage?.getModelPreferences()[currentAuthStatus().endpoint]!,
                })
            )
            vi.spyOn(modelsService, 'models', 'get').mockReturnValue([model1chat])
            expect(await firstValueFrom(modelsService.getDefaultChatModel())).toBe(model1chat.id)
        })

        it('only allows setting appropriate model types', () => {
            vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
                Observable.of({
                    ...EMPTY_MODELS_DATA,
                    primaryModels: [model1chat, model2chat, model3all, model4edit],
                })
            )
            expect(async () =>
                modelsService.setSelectedModel(ModelUsage.Chat, model4edit)
            ).rejects.toThrow('Model "model-4" is not compatible with usage type "chat".')
            expect(async () =>
                modelsService.setSelectedModel(ModelUsage.Edit, model1chat)
            ).rejects.toThrow('Model "model-1" is not compatible with usage type "edit"')
        })
    })

    describe('isModelAvailable', () => {
        const enterpriseModel = createModel({
            id: 'enterprise-model',
            usage: [ModelUsage.Chat],
            tags: [ModelTag.Enterprise],
        })
        const proModel = createModel({
            id: 'pro-model',
            usage: [ModelUsage.Chat],
            tags: [ModelTag.Pro],
        })
        const freeModel = createModel({
            id: 'free-model',
            usage: [ModelUsage.Chat],
            // We don't include ModelTag.Free here to test that it's not required.
            tags: [],
        })

        beforeEach(() => {
            vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
                Observable.of({
                    ...EMPTY_MODELS_DATA,
                    primaryModels: [enterpriseModel, proModel, freeModel],
                })
            )
        })

        it('returns false for unknown model', async () => {
            mockAuthStatus(codyProAuthStatus)
            vi.spyOn(userProductSubscriptionModule, 'userProductSubscription', 'get').mockReturnValue(
                Observable.of(codyProSub)
            )
            expect(await firstValueFrom(modelsService.isModelAvailable('unknown-model'))).toBe(false)
        })

        it('allows enterprise user to use any model', async () => {
            mockAuthStatus(enterpriseAuthStatus)
            vi.spyOn(userProductSubscriptionModule, 'userProductSubscription', 'get').mockReturnValue(
                Observable.of(null)
            )
            expect(await firstValueFrom(modelsService.isModelAvailable(enterpriseModel))).toBe(true)
            expect(await firstValueFrom(modelsService.isModelAvailable(proModel))).toBe(true)
            expect(await firstValueFrom(modelsService.isModelAvailable(freeModel))).toBe(true)
        })

        it('allows Cody Pro user to use Pro and Free models', async () => {
            mockAuthStatus(codyProAuthStatus)
            vi.spyOn(userProductSubscriptionModule, 'userProductSubscription', 'get').mockReturnValue(
                Observable.of(codyProSub)
            )
            expect(await firstValueFrom(modelsService.isModelAvailable(enterpriseModel))).toBe(false)
            expect(await firstValueFrom(modelsService.isModelAvailable(proModel))).toBe(true)
            expect(await firstValueFrom(modelsService.isModelAvailable(freeModel))).toBe(true)
        })

        it('allows free user to use only Free models', async () => {
            mockAuthStatus(freeUserAuthStatus)
            vi.spyOn(userProductSubscriptionModule, 'userProductSubscription', 'get').mockReturnValue(
                Observable.of(freeUserSub)
            )
            expect(await firstValueFrom(modelsService.isModelAvailable(enterpriseModel))).toBe(false)
            expect(await firstValueFrom(modelsService.isModelAvailable(proModel))).toBe(false)
            expect(await firstValueFrom(modelsService.isModelAvailable(freeModel))).toBe(true)
        })

        it('handles model passed as string', async () => {
            mockAuthStatus(freeUserAuthStatus)
            vi.spyOn(userProductSubscriptionModule, 'userProductSubscription', 'get').mockReturnValue(
                Observable.of(freeUserSub)
            )
            expect(await firstValueFrom(modelsService.isModelAvailable(freeModel.id))).toBe(true)
            expect(await firstValueFrom(modelsService.isModelAvailable(proModel.id))).toBe(false)

            mockAuthStatus(codyProAuthStatus)
            vi.spyOn(userProductSubscriptionModule, 'userProductSubscription', 'get').mockReturnValue(
                Observable.of(codyProSub)
            )
            expect(await firstValueFrom(modelsService.isModelAvailable(proModel.id))).toBe(true)
        })
    })

    describe('ModelCategory', () => {
        it('includes ModelTag.Other', () => {
            const otherModel = createModel({
                id: 'other-model',
                usage: [ModelUsage.Chat],
                tags: [ModelTag.Other],
            })

            const modelsService = modelsServiceWithModels([otherModel])

            vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
                Observable.of({
                    ...EMPTY_MODELS_DATA,
                    primaryModels: [otherModel],
                })
            )

            expect(otherModel.tags).toContain(ModelTag.Other)
            expect(modelsService.models).toContain(otherModel)
        })

        it('correctly categorizes models with different tags', () => {
            const powerModel = createModel({
                id: 'power-model',
                usage: [ModelUsage.Chat],
                tags: [ModelTag.Power],
            })
            const balancedModel = createModel({
                id: 'balanced-model',
                usage: [ModelUsage.Chat],
                tags: [ModelTag.Balanced],
            })
            const speedModel = createModel({
                id: 'speed-model',
                usage: [ModelUsage.Chat],
                tags: [ModelTag.Speed],
            })
            const accuracyModel = createModel({
                id: 'accuracy-model',
                usage: [ModelUsage.Chat],
                tags: ['accuracy' as ModelTag],
            })

            const modelsService = modelsServiceWithModels([
                powerModel,
                balancedModel,
                speedModel,
                accuracyModel,
            ])

            vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
                Observable.of({
                    ...EMPTY_MODELS_DATA,
                    primaryModels: [powerModel, balancedModel, speedModel, accuracyModel],
                })
            )

            expect(modelsService.models).toContain(powerModel)
            expect(modelsService.models).toContain(balancedModel)
            expect(modelsService.models).toContain(speedModel)
            expect(modelsService.models).toContain(accuracyModel)
        })

        it('handles models with multiple category tags', () => {
            const multiCategoryModel = createModel({
                id: 'multi-category-model',
                usage: [ModelUsage.Chat],
                tags: [ModelTag.Power, ModelTag.Balanced],
            })

            const modelsService = modelsServiceWithModels([multiCategoryModel])

            vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
                Observable.of({
                    ...EMPTY_MODELS_DATA,
                    primaryModels: [multiCategoryModel],
                })
            )

            expect(multiCategoryModel.tags).toContain(ModelTag.Power)
            expect(multiCategoryModel.tags).toContain(ModelTag.Balanced)
            expect(modelsService.models).toContain(multiCategoryModel)
        })

        it('correctly handles models without category tags', () => {
            const uncategorizedModel = createModel({
                id: 'uncategorized-model',
                usage: [ModelUsage.Chat],
                tags: [],
            })

            const modelsService = modelsServiceWithModels([uncategorizedModel])

            vi.spyOn(modelsService, 'modelsChanges', 'get').mockReturnValue(
                Observable.of({
                    ...EMPTY_MODELS_DATA,
                    primaryModels: [uncategorizedModel],
                })
            )

            expect(uncategorizedModel.tags).toHaveLength(0)
            expect(modelsService.models).toContain(uncategorizedModel)
        })
    })

    describe('A/B test for default edit model', () => {
        let modelsService: ModelsService
        let storage: TestLocalStorageForModelPreferences
        const gpt4oMiniModel = createModel({
            id: 'gpt-4o-mini',
            modelRef: 'openai::unknown::gpt-4o-mini',
            usage: [ModelUsage.Edit],
        })
        const otherEditModel = createModel({
            id: 'other-edit-model',
            modelRef: 'other::unknown::other-edit-model',
            usage: [ModelUsage.Edit],
        })

        beforeEach(() => {
            mockAuthStatus(freeUserAuthStatus)
            vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(true))
            vi.spyOn(userProductSubscriptionModule, 'userProductSubscription', 'get').mockReturnValue(
                Observable.of(codyProSub)
            )

            storage = new TestLocalStorageForModelPreferences()
        })

        afterEach(() => {
            vi.resetAllMocks()
        })

        it('sets gpt-4o-mini as default edit model for enrolled users in A/B test', async () => {
            modelsService = new ModelsService(
                Observable.of({
                    primaryModels: [otherEditModel, gpt4oMiniModel],
                    localModels: [],
                    preferences: {
                        defaults: { edit: otherEditModel.id },
                        selected: { edit: otherEditModel.id },
                    },
                })
            )
            modelsService.setStorage(storage)

            const defaultEditModelId = await firstValueFrom(modelsService.getDefaultEditModel())
            expect(defaultEditModelId).toBe('gpt-4o-mini')

            const prefsAfter = storage.getModelPreferences()
            const selectedEditModel = prefsAfter[freeUserAuthStatus.endpoint]?.selected?.edit
            expect(selectedEditModel).toBe('gpt-4o-mini')
        })

        it('does not overwrite user preferences if already enrolled', async () => {
            storage.setModelPreferences({
                [AUTH_STATUS_FIXTURE_AUTHED.endpoint]: {
                    defaults: {},
                    selected: { edit: 'other-edit-model' },
                },
            })
            storage.getEnrollmentHistory(FeatureFlag.CodyEditDefaultToGpt4oMini)

            modelsService = new ModelsService(
                Observable.of({
                    primaryModels: [otherEditModel, gpt4oMiniModel],
                    localModels: [],
                    preferences: {
                        defaults: { edit: otherEditModel.id },
                        selected: { edit: otherEditModel.id },
                    },
                })
            )
            modelsService.setStorage(storage)

            const defaultEditModelId = await firstValueFrom(modelsService.getDefaultEditModel())
            expect(defaultEditModelId).toBe('other-edit-model')

            const prefsAfter = storage.getModelPreferences()
            const selectedEditModel = prefsAfter[freeUserAuthStatus.endpoint]?.selected?.edit
            expect(selectedEditModel).toBe('other-edit-model')
        })
    })
})
