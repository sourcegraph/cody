import { describe, expect, it } from 'vitest'
import { ANSWER_TOKENS } from '../prompt/constants'
import type { CodyLLMSiteConfiguration } from '../sourcegraph-api/graphql/client'
import {
    CHAT_INPUT_TOKEN_BUDGET,
    CHAT_OUTPUT_TOKEN_BUDGET,
    EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
    EXTENDED_USER_CONTEXT_TOKEN_BUDGET,
} from '../token/constants'
import { getEnterpriseContextWindow, getModelInfo } from './utils'

describe('getModelInfo', () => {
    it('splits model ID and returns provider and title', () => {
        const result = getModelInfo('Anthropic/Claude 2.0')
        expect(result).toEqual({
            provider: 'Anthropic',
            title: 'Claude 2.0',
        })
    })

    it('handles model ID without title', () => {
        const result = getModelInfo('Anthropic/')
        expect(result).toEqual({
            provider: 'Anthropic',
            title: '',
        })
    })

    it('replaces dashes in title with spaces', () => {
        const result = getModelInfo('example/model-with-dashes')
        expect(result).toEqual({
            provider: 'example',
            title: 'model with dashes',
        })
    })

    it('handles model ID with multiple dashes', () => {
        const result = getModelInfo('fireworks/accounts/fireworks/models/mixtral-8x7b-instruct')
        expect(result).toEqual({
            provider: 'fireworks',
            title: 'mixtral 8x7b instruct',
        })
    })
})

describe('getEnterpriseContextWindow', () => {
    it('returns default context window for non-smart context models', () => {
        const chatModel = 'openai/gpt-3.5-turbo'
        const configOverwrites: CodyLLMSiteConfiguration = {
            chatModelMaxTokens: undefined,
            smartContextWindow: false,
        }

        expect(
            getEnterpriseContextWindow(chatModel, configOverwrites, { providerLimitPrompt: undefined })
        ).toEqual({
            input: CHAT_INPUT_TOKEN_BUDGET,
            output: ANSWER_TOKENS,
        })
    })

    it('returns extended context window for models that support smart context', () => {
        const chatModel = 'openai/gpt-4o'
        const configOverwritesWithSmartContext: CodyLLMSiteConfiguration = {
            chatModel,
            chatModelMaxTokens: 10,
            smartContextWindow: true,
        }
        expect(
            getEnterpriseContextWindow(chatModel, configOverwritesWithSmartContext, {
                providerLimitPrompt: undefined,
            })
        ).toEqual({
            input: EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
            output: CHAT_OUTPUT_TOKEN_BUDGET,
            context: { user: EXTENDED_USER_CONTEXT_TOKEN_BUDGET },
        })
    })

    describe('returns extended context window for models that support smart context', () => {
        const extendedContextWindow = {
            input: EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
            output: CHAT_OUTPUT_TOKEN_BUDGET,
            context: { user: EXTENDED_USER_CONTEXT_TOKEN_BUDGET },
        }

        const nonExtendedContextWindow = {
            input: CHAT_INPUT_TOKEN_BUDGET,
            output: ANSWER_TOKENS,
        }

        it.each([
            ['claude-3-opus', extendedContextWindow],
            ['claude-3-sonnet', extendedContextWindow],
            ['anthropic/claude-3-opus', extendedContextWindow],
            ['anthropic/claude-3-opus-20240229', extendedContextWindow],
            ['anthropic/claude-3-sonnet', extendedContextWindow],
            ['anthropic/claude-3-sonnet-20240229', extendedContextWindow],
            ['openai/gpt-4o', extendedContextWindow],
            ['bedrock/gpt-4o', extendedContextWindow],
            ['sourcegraph/gpt-4o', extendedContextWindow],
            ['bedrock/gpt-4', nonExtendedContextWindow],
            ['claude-3', nonExtendedContextWindow],
            ['claude-3-haiku', nonExtendedContextWindow],
            ['anthropic/claude-3-haiku-20240307', nonExtendedContextWindow],
            ['anthropic/claude-2.0', nonExtendedContextWindow],
            ['claude-2.0', nonExtendedContextWindow],
        ])('context window for model named %j', (chatModel, test) => {
            const contextWindow = getEnterpriseContextWindow(
                chatModel,
                { smartContextWindow: true },
                { providerLimitPrompt: undefined }
            )
            expect(contextWindow).toEqual(test)
        })
    })
})
