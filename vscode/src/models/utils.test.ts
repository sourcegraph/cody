import {
    ANSWER_TOKENS,
    CHAT_INPUT_TOKEN_BUDGET,
    CHAT_OUTPUT_TOKEN_BUDGET,
    type CodyLLMSiteConfiguration,
    EXTENDED_CHAT_INPUT_TOKEN_BUDGET,
    EXTENDED_USER_CONTEXT_TOKEN_BUDGET,
} from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import { getEnterpriseContextWindow } from './utils'

describe('getEnterpriseContextWindow', () => {
    it('returns default context window for non-smart context models', () => {
        const chatModel = 'openai/gpt-3.5-turbo'
        const configOverwrites: CodyLLMSiteConfiguration = {
            chatModelMaxTokens: undefined,
            smartContextWindow: false,
        }

        expect(getEnterpriseContextWindow(chatModel, configOverwrites)).toEqual({
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
        expect(getEnterpriseContextWindow(chatModel, configOverwritesWithSmartContext)).toEqual({
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
            const contextWindow = getEnterpriseContextWindow(chatModel, { smartContextWindow: true })
            expect(contextWindow).toEqual(test)
        })
    })
})
