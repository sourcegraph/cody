import { beforeAll, describe, expect, it } from 'vitest'
import { ModelProvider } from '../models/index'
import { DOTCOM_URL } from '../sourcegraph-api/environments'
import { CHAT_TOKEN_BUDGET } from '../token/constants'
import { getDotComDefaultModels } from './dotcom'
import { ModelUsage } from './types'

describe('Model Provider', () => {
    beforeAll(() => {
        ModelProvider.getProviders(ModelUsage.Chat, false, DOTCOM_URL.toString())
    })

    it('returns default token limit for unknown model', () => {
        const max = ModelProvider.getContextWindowByID('unknown-model')
        expect(max).toEqual({ input: CHAT_TOKEN_BUDGET })
    })

    it('returns max token limit for known chat model', () => {
        const models = getDotComDefaultModels('default')
        const cw = ModelProvider.getContextWindowByID(models[0].model)
        expect(cw.input).toEqual(models[0].contextWindow.input)
        expect(models[0].contextWindow.context?.user).toEqual(undefined)
    })

    it('returns max token limit for dot com chat model with user context feature flag', () => {
        const models = getDotComDefaultModels('experimental')
        ModelProvider.setProviders(models)
        const claude3SonnetModelID = 'anthropic/claude-3-sonnet-20240229'
        const claude3SonnetModel = models.find(m => m.model === claude3SonnetModelID)
        expect(claude3SonnetModel?.contextWindow?.context?.user).greaterThan(0)
        expect(claude3SonnetModel).toBeDefined()
        const cw = ModelProvider.getContextWindowByID(claude3SonnetModelID)
        expect(cw).toEqual(claude3SonnetModel?.contextWindow)
    })

    it('returns default token limit for unknown model - Enterprise user', () => {
        ModelProvider.getProviders(ModelUsage.Chat, false, 'https://example.com')
        const cw = ModelProvider.getContextWindowByID('unknown-model')
        expect(cw).toEqual({ input: CHAT_TOKEN_BUDGET })
    })

    it('returns max token limit for known model - Enterprise user', () => {
        ModelProvider.setProviders([
            new ModelProvider('enterprise-model', [ModelUsage.Chat], { input: 200 }),
        ])
        ModelProvider.getProviders(ModelUsage.Chat, false, 'enterprise-model')
        ModelProvider.setProviders([
            new ModelProvider('model-with-limit', [ModelUsage.Chat], { input: 200 }),
        ])
        const cw = ModelProvider.getContextWindowByID('model-with-limit')
        expect(cw.input).toEqual(200)
    })
})
