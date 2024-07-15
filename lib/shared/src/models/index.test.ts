import { beforeEach, describe, expect, it } from 'vitest'
import { type AuthStatus, defaultAuthStatus } from '../auth/types'
import { Model, ModelsService } from '../models/index'
import { CHAT_INPUT_TOKEN_BUDGET, CHAT_OUTPUT_TOKEN_BUDGET } from '../token/constants'
import { getDotComDefaultModels } from './dotcom'
import { ModelTag } from './tags'
import { ModelUsage } from './types'

describe('Model Provider', () => {
    const freeUserAuthStatus: AuthStatus = {
        ...defaultAuthStatus,
        authenticated: true,
        isDotCom: true,
        userCanUpgrade: true,
    }

    const codyProAuthStatus: AuthStatus = {
        ...freeUserAuthStatus,
        userCanUpgrade: false,
    }

    const enterpriseAuthStatus: AuthStatus = {
        ...defaultAuthStatus,
        authenticated: true,
        isDotCom: false,
    }

    // Reset service
    beforeEach(() => {
        ModelsService.reset()
    })

    describe('getContextWindowByID', () => {
        it('returns default token limit for unknown model', () => {
            const max = ModelsService.getContextWindowByID('unknown-model')
            expect(max).toEqual({ input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET })
        })

        it('returns max token limit for known DotCom chat model ', () => {
            const models = getDotComDefaultModels()
            ModelsService.setModels(models)
            expect(models[0].model).toBeDefined()
            const cw = ModelsService.getContextWindowByID(models[0].model)
            expect(cw).toStrictEqual(models[0].contextWindow)
        })

        it('returns max token limit for known DotCom chat model with higher context window (claude 3)', () => {
            const models = getDotComDefaultModels()
            ModelsService.setModels(models)
            const claude3SonnetModelID = 'anthropic/claude-3-5-sonnet-20240620'
            const claude3SonnetModel = ModelsService.getModelByID(claude3SonnetModelID)
            expect(claude3SonnetModel?.contextWindow?.context?.user).greaterThan(0)
            expect(claude3SonnetModel).toBeDefined()
            const cw = ModelsService.getContextWindowByID(claude3SonnetModelID)
            expect(cw).toEqual(claude3SonnetModel?.contextWindow)
        })

        it('returns default token limit for unknown model - Enterprise user', () => {
            const cw = ModelsService.getContextWindowByID('unknown-model')
            expect(cw).toEqual({ input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET })
        })

        it('returns max token limit for known model - Enterprise user', () => {
            ModelsService.setModels([
                new Model({
                    model: 'enterprise-model',
                    usage: [ModelUsage.Chat],
                    contextWindow: { input: 200, output: 100 },
                }),
            ])
            const cw = ModelsService.getContextWindowByID('enterprise-model')
            expect(cw.input).toEqual(200)
        })
    })

    describe('getMaxOutputCharsByModel', () => {
        it('returns default token limit for unknown model', () => {
            const { output } = ModelsService.getContextWindowByID('unknown-model')
            expect(output).toEqual(CHAT_OUTPUT_TOKEN_BUDGET)
        })

        it('returns max token limit for known chat model', () => {
            const knownModel = getDotComDefaultModels()[0]
            const { output } = ModelsService.getContextWindowByID(knownModel.model)
            expect(output).toEqual(knownModel.contextWindow.output)
        })

        it('returns default token limit for unknown model - Enterprise user', () => {
            const { output } = ModelsService.getContextWindowByID('unknown-model')
            expect(output).toEqual(CHAT_OUTPUT_TOKEN_BUDGET)
        })

        it('returns max token limit for known model - Enterprise user', () => {
            ModelsService.setModels([
                new Model({
                    model: 'model-with-limit',
                    usage: [ModelUsage.Chat],
                    contextWindow: { input: 8000, output: 2000 },
                }),
            ])
            const { output } = ModelsService.getContextWindowByID('model-with-limit')
            expect(output).toEqual(2000)
        })
    })

    describe('default models', () => {
        const model1chat = new Model({
            model: 'model-1',
            usage: [ModelUsage.Chat],
        })

        const model2chat = new Model({
            model: 'model-2',
            usage: [ModelUsage.Chat],
        })

        const model3all = new Model({
            model: 'model-3',
            usage: [ModelUsage.Chat, ModelUsage.Edit],
        })

        const model4edit = new Model({
            model: 'model-4',
            usage: [ModelUsage.Edit],
        })

        it('allows setting default models per type', () => {
            ModelsService.setModels([model1chat, model2chat, model3all, model4edit])
            ModelsService.setDefaultModel(ModelUsage.Chat, model2chat)
            ModelsService.setDefaultModel(ModelUsage.Edit, model4edit)
            expect(ModelsService.getDefaultChatModel(codyProAuthStatus)).toBe(model2chat.model)
            expect(ModelsService.getDefaultEditModel(codyProAuthStatus)).toBe(model4edit.model)
        })

        it('only allows setting known models as default', async () => {
            // Set default before settings models is a no-op
            await ModelsService.setDefaultModel(ModelUsage.Chat, model2chat.model)
            ModelsService.setModels([model1chat, model2chat])
            expect(ModelsService.getDefaultChatModel(codyProAuthStatus)).toBe(model1chat.model)
        })

        it('only allows setting appropriate model types', () => {
            ModelsService.setModels([model1chat, model2chat, model3all, model4edit])
            expect(async () =>
                ModelsService.setDefaultModel(ModelUsage.Chat, model4edit)
            ).rejects.toThrow('Model "model-4" is not compatible with usage type "chat".')
            expect(async () =>
                ModelsService.setDefaultModel(ModelUsage.Edit, model1chat)
            ).rejects.toThrow('Model "model-1" is not compatible with usage type "edit"')
        })
    })

    describe('canUserUseModel', () => {
        const enterpriseModel = new Model({
            model: 'enterprise-model',
            usage: [ModelUsage.Chat],
            tags: [ModelTag.Enterprise],
        })
        const proModel = new Model({
            model: 'pro-model',
            usage: [ModelUsage.Chat],
            tags: [ModelTag.Pro],
        })
        const freeModel = new Model({
            model: 'free-model',
            usage: [ModelUsage.Chat],
            // We don't include ModelTag.Free here to test that it's not required.
            tags: [],
        })

        beforeEach(() => {
            ModelsService.setModels([enterpriseModel, proModel, freeModel])
        })

        it('returns false for unknown model', () => {
            expect(ModelsService.canUserUseModel(codyProAuthStatus, 'unknown-model')).toBe(false)
        })

        it('allows enterprise user to use any model', () => {
            expect(ModelsService.canUserUseModel(enterpriseAuthStatus, enterpriseModel)).toBe(true)
            expect(ModelsService.canUserUseModel(enterpriseAuthStatus, proModel)).toBe(true)
            expect(ModelsService.canUserUseModel(enterpriseAuthStatus, freeModel)).toBe(true)
        })

        it('allows Cody Pro user to use Pro and Free models', () => {
            expect(ModelsService.canUserUseModel(codyProAuthStatus, enterpriseModel)).toBe(false)
            expect(ModelsService.canUserUseModel(codyProAuthStatus, proModel)).toBe(true)
            expect(ModelsService.canUserUseModel(codyProAuthStatus, freeModel)).toBe(true)
        })

        it('allows free user to use only Free models', () => {
            expect(ModelsService.canUserUseModel(freeUserAuthStatus, enterpriseModel)).toBe(false)
            expect(ModelsService.canUserUseModel(freeUserAuthStatus, proModel)).toBe(false)
            expect(ModelsService.canUserUseModel(freeUserAuthStatus, freeModel)).toBe(true)
        })

        it('handles model passed as string', () => {
            expect(ModelsService.canUserUseModel(freeUserAuthStatus, freeModel.model)).toBe(true)
            expect(ModelsService.canUserUseModel(freeUserAuthStatus, proModel.model)).toBe(false)
            expect(ModelsService.canUserUseModel(codyProAuthStatus, proModel.model)).toBe(true)
        })
    })
})
