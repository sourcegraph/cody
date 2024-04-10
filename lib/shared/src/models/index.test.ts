import { beforeAll, describe, expect, it } from 'vitest'
import { ModelProvider } from '../models/index'
import { DOTCOM_URL } from '../sourcegraph-api/environments'
import { CHAT_TOKEN_BUDGET } from '../token/constants'
import { DEFAULT_DOT_COM_MODELS } from './dotcom'
import { ModelUsage } from './types'

describe('getMaxTokenByID', () => {
    beforeAll(() => {
        ModelProvider.getProviders(ModelUsage.Chat, false, DOTCOM_URL.toString())
    })

    it('returns default token limit for unknown model', () => {
        const maxTokens = ModelProvider.maxRequestTokensForModel('unknown-model')
        expect(maxToken).toEqual(CHAT_TOKEN_BUDGET)
    })

    it('returns max token limit for known chat model', () => {
        const maxToken = ModelProvider.getMaxTokenByID(DEFAULT_DOT_COM_MODELS[0].model)
        expect(maxToken).toEqual(DEFAULT_DOT_COM_MODELS[0].maxToken)
    })

    it('returns default token limit for unknown model - Enterprise user', () => {
        ModelProvider.getProviders(ModelUsage.Chat, false, 'https://example.com')
        const maxToken = ModelProvider.getMaxTokenByID('unknown-model')
        expect(maxToken).toEqual(CHAT_TOKEN_BUDGET)
    })

    it('returns max token limit for known model - Enterprise user', () => {
        ModelProvider.getProviders(ModelUsage.Chat, false, 'https://example.com')
        ModelProvider.setProviders([new ModelProvider('model-with-limit', [ModelUsage.Chat], 200)])
        const maxToken = ModelProvider.getMaxTokenByID('model-with-limit')
        expect(maxToken).toEqual(200)
    })
})
