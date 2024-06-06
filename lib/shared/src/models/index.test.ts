import { beforeAll, describe, expect, it } from 'vitest'
import { Model, ModelsService } from '../models/index'
import { DOTCOM_URL } from '../sourcegraph-api/environments'
import { CHAT_INPUT_TOKEN_BUDGET, CHAT_OUTPUT_TOKEN_BUDGET } from '../token/constants'
import { getDotComDefaultModels } from './dotcom'
import { ModelUsage } from './types'

describe('Model Provider', () => {
    describe('getContextWindowByID', () => {
        beforeAll(() => {
            ModelsService.getModels(ModelUsage.Chat, false, DOTCOM_URL.toString())
        })

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
            const claude3SonnetModelID = 'anthropic/claude-3-sonnet-20240229'
            const claude3SonnetModel = ModelsService.getModelByID(claude3SonnetModelID)
            expect(claude3SonnetModel?.contextWindow?.context?.user).greaterThan(0)
            expect(claude3SonnetModel).toBeDefined()
            const cw = ModelsService.getContextWindowByID(claude3SonnetModelID)
            expect(cw).toEqual(claude3SonnetModel?.contextWindow)
        })

        it('returns default token limit for unknown model - Enterprise user', () => {
            ModelsService.getModels(ModelUsage.Chat, false, 'https://example.com')
            const cw = ModelsService.getContextWindowByID('unknown-model')
            expect(cw).toEqual({ input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET })
        })

        it('returns max token limit for known model - Enterprise user', () => {
            ModelsService.setModels([
                new Model('enterprise-model', [ModelUsage.Chat], { input: 200, output: 100 }),
            ])
            const cw = ModelsService.getContextWindowByID('enterprise-model')
            expect(cw.input).toEqual(200)
        })
    })

    describe('getMaxOutputCharsByModel', () => {
        beforeAll(() => {
            ModelsService.getModels(ModelUsage.Chat, false, DOTCOM_URL.toString())
        })

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
            ModelsService.getModels(ModelUsage.Chat, false, 'https://example.com')
            const { output } = ModelsService.getContextWindowByID('unknown-model')
            expect(output).toEqual(CHAT_OUTPUT_TOKEN_BUDGET)
        })

        it('returns max token limit for known model - Enterprise user', () => {
            ModelsService.getModels(ModelUsage.Chat, false, 'https://example.com')
            ModelsService.setModels([
                new Model('model-with-limit', [ModelUsage.Chat], { input: 8000, output: 2000 }),
            ])
            const { output } = ModelsService.getContextWindowByID('model-with-limit')
            expect(output).toEqual(2000)
        })
    })
})
