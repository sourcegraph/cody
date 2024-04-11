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
        expect(max).toEqual({ chat: CHAT_TOKEN_BUDGET, user: 0, enhanced: 0 })
    })

    it('returns max token limit for known chat model', () => {
        const models = getDotComDefaultModels(false)
        const cw = ModelProvider.getContextWindowByID(models[0].model)
        expect(cw.chat).toEqual(models[0].contextWindow.chat)
        expect(models[0].contextWindow.user).toEqual(0)
    })

    it('returns max token limit for dot com chat model with user context feature flag', () => {
        const models = getDotComDefaultModels(true)
        ModelProvider.setProviders(models)
        const claude3SonnetModelID = 'anthropic/claude-3-sonnet-20240229'
        const claude3SonnetModel = models.find(m => m.model === claude3SonnetModelID)
        expect(claude3SonnetModel?.contextWindow?.user).greaterThan(0)
        expect(claude3SonnetModel).toBeDefined()
        const cw = ModelProvider.getContextWindowByID(claude3SonnetModelID)
        expect(cw).toEqual(claude3SonnetModel?.contextWindow)
    })

    it('returns default token limit for unknown model - Enterprise user', () => {
        ModelProvider.getProviders(ModelUsage.Chat, false, 'https://example.com')
        const cw = ModelProvider.getContextWindowByID('unknown-model')
        expect(cw).toEqual({ chat: CHAT_TOKEN_BUDGET, user: 0, enhanced: 0 })
    })

    it('returns max token limit for known model - Enterprise user', () => {
        ModelProvider.setProviders([
            new ModelProvider('enterprise-model', [ModelUsage.Chat], {
                chat: 200,
                user: 0,
                enhanced: 0,
            }),
        ])
        ModelProvider.getProviders(ModelUsage.Chat, false, 'enterprise-model')
        const tokens = { chat: 200, user: 0, enhanced: 0 }
        ModelProvider.setProviders([new ModelProvider('model-with-limit', [ModelUsage.Chat], tokens)])
        const cw = ModelProvider.getContextWindowByID('model-with-limit')
        expect(cw.chat).toEqual(tokens.chat)
    })
})
