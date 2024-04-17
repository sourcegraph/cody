import { beforeAll, describe, expect, it } from 'vitest'
import { ModelProvider } from '../models/index'
import {
    DEFAULT_CHAT_MODEL_INPUT_TOKEN_LIMIT,
    DEFAULT_CHAT_MODEL_OUTPUT_TOKEN_LIMIT,
    tokensToChars,
} from '../prompt/constants'
import { DOTCOM_URL } from '../sourcegraph-api/environments'
import { DEFAULT_DOT_COM_MODELS } from './dotcom'
import { ModelUsage } from './types'

describe('getMaxInputCharsByModel', () => {
    beforeAll(() => {
        ModelProvider.getProviders(ModelUsage.Chat, false, DOTCOM_URL.toString())
    })

    it('returns default token limit for unknown model', () => {
        const maxChars = ModelProvider.getMaxInputCharsByModel('unknown-model')
        expect(maxChars).toEqual(tokensToChars(DEFAULT_CHAT_MODEL_INPUT_TOKEN_LIMIT))
    })

    it('returns max token limit for known chat model', () => {
        const maxChars = ModelProvider.getMaxInputCharsByModel(DEFAULT_DOT_COM_MODELS[0].model)
        expect(maxChars).toEqual(tokensToChars(DEFAULT_DOT_COM_MODELS[0].maxInputToken))
    })

    it('returns default token limit for unknown model - Enterprise user', () => {
        ModelProvider.getProviders(ModelUsage.Chat, false, 'https://example.com')
        const maxChars = ModelProvider.getMaxInputCharsByModel('unknown-model')
        expect(maxChars).toEqual(tokensToChars(DEFAULT_CHAT_MODEL_INPUT_TOKEN_LIMIT))
    })

    it('returns max token limit for known model - Enterprise user', () => {
        ModelProvider.getProviders(ModelUsage.Chat, false, 'https://example.com')
        ModelProvider.setProviders([new ModelProvider('model-with-limit', [ModelUsage.Chat], 200)])
        const maxChars = ModelProvider.getMaxInputCharsByModel('model-with-limit')
        expect(maxChars).toEqual(tokensToChars(200))
    })
})

describe('getMaxOutputCharsByModel', () => {
    beforeAll(() => {
        ModelProvider.getProviders(ModelUsage.Chat, false, DOTCOM_URL.toString())
    })

    it('returns default token limit for unknown model', () => {
        const maxChars = ModelProvider.getMaxOutputCharsByModel('unknown-model')
        expect(maxChars).toEqual(tokensToChars(DEFAULT_CHAT_MODEL_OUTPUT_TOKEN_LIMIT))
    })

    it('returns max token limit for known chat model', () => {
        const maxChars = ModelProvider.getMaxOutputCharsByModel(DEFAULT_DOT_COM_MODELS[0].model)
        expect(maxChars).toEqual(tokensToChars(DEFAULT_DOT_COM_MODELS[0].maxOutputToken))
    })

    it('returns default token limit for unknown model - Enterprise user', () => {
        ModelProvider.getProviders(ModelUsage.Chat, false, 'https://example.com')
        const maxChars = ModelProvider.getMaxOutputCharsByModel('unknown-model')
        expect(maxChars).toEqual(tokensToChars(DEFAULT_CHAT_MODEL_OUTPUT_TOKEN_LIMIT))
    })

    it('returns max token limit for known model - Enterprise user', () => {
        ModelProvider.getProviders(ModelUsage.Chat, false, 'https://example.com')
        ModelProvider.setProviders([
            new ModelProvider('model-with-limit', [ModelUsage.Chat], 8000, 2000),
        ])
        const maxChars = ModelProvider.getMaxOutputCharsByModel('model-with-limit')
        expect(maxChars).toEqual(tokensToChars(2000))
    })
})
