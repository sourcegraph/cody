import { beforeAll, describe, expect, it } from 'vitest'
import { ModelProvider } from '../models/index'
import { DEFAULT_FAST_MODEL_TOKEN_LIMIT, tokensToChars } from '../prompt/constants'
import { DOTCOM_URL } from '../sourcegraph-api/environments'
import { DEFAULT_DOT_COM_MODELS } from './dotcom'
import { ModelUsage } from './types'

describe('getMaxCharsByModel', () => {
    beforeAll(() => {
        ModelProvider.getProviders(ModelUsage.Chat, false, DOTCOM_URL.toString())
    })

    it('returns default token limit for unknown model', () => {
        const maxChars = ModelProvider.getMaxCharsByModel('unknown-model')
        expect(maxChars).toEqual(tokensToChars(DEFAULT_FAST_MODEL_TOKEN_LIMIT))
    })

    it('returns max token limit for known chat model', () => {
        const maxChars = ModelProvider.getMaxCharsByModel(DEFAULT_DOT_COM_MODELS[0].model)
        expect(maxChars).toEqual(tokensToChars(DEFAULT_DOT_COM_MODELS[0].maxToken))
    })

    it('returns default token limit for unknown model - Enterprise user', () => {
        ModelProvider.getProviders(ModelUsage.Chat, false, 'https://example.com')
        const maxChars = ModelProvider.getMaxCharsByModel('unknown-model')
        expect(maxChars).toEqual(tokensToChars(DEFAULT_FAST_MODEL_TOKEN_LIMIT))
    })

    it('returns max token limit for known model - Enterprise user', () => {
        ModelProvider.getProviders(ModelUsage.Chat, false, 'https://example.com')
        ModelProvider.setProviders([new ModelProvider('model-with-limit', [ModelUsage.Chat], 200)])
        const maxChars = ModelProvider.getMaxCharsByModel('model-with-limit')
        expect(maxChars).toEqual(tokensToChars(200))
    })
})
