import { beforeAll, describe, expect, it } from 'vitest'
import { ModelProvider } from '../models/index'
import { DEFAULT_FAST_MODEL_TOKEN_LIMIT } from '../prompt/constants'
import { DOTCOM_URL } from '../sourcegraph-api/environments'
import { DEFAULT_DOT_COM_MODELS } from './dotcom'
import { ModelUsage } from './types'

describe('getMaxCharsByModel', () => {
    beforeAll(() => {
        ModelProvider.getProviders(ModelUsage.Chat, false, DOTCOM_URL.toString())
    })

    it('returns default token limit for unknown model', () => {
        const maxTokens = ModelProvider.getMaxTokensByModel('unknown-model')
        expect(maxTokens).toEqual(DEFAULT_FAST_MODEL_TOKEN_LIMIT)
    })

    it('returns max token limit for known chat model', () => {
        const maxTokens = ModelProvider.getMaxTokensByModel(DEFAULT_DOT_COM_MODELS[0].model)
        expect(maxTokens).toEqual(DEFAULT_DOT_COM_MODELS[0].maxToken)
    })

    it('returns default token limit for unknown model - Enterprise user', () => {
        ModelProvider.getProviders(ModelUsage.Chat, false, 'https://example.com')
        const maxTokens = ModelProvider.getMaxTokensByModel('unknown-model')
        expect(maxTokens).toEqual(DEFAULT_FAST_MODEL_TOKEN_LIMIT)
    })

    it('returns max token limit for known model - Enterprise user', () => {
        ModelProvider.getProviders(ModelUsage.Chat, false, 'https://example.com')
        ModelProvider.setProviders([new ModelProvider('model-with-limit', [ModelUsage.Chat], 200)])
        const maxTokens = ModelProvider.getMaxTokensByModel('model-with-limit')
        expect(maxTokens).toEqual(200)
    })
})
