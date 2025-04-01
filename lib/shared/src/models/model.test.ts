import { describe, expect, it } from 'vitest'
import type { ModelCategory } from '..'
import { ModelTag, ModelUsage } from '..'
import { type ServerModel, createModelFromServerModel, getServerModelTags, toLegacyModel } from './model'

describe('getServerModelTags', () => {
    it('returns basic tags for a standard model', () => {
        const tags = getServerModelTags(['chat'], ModelTag.Speed, 'stable', ModelTag.Pro)
        expect(tags).toEqual([ModelTag.Pro, ModelTag.Speed])
    })

    it('convert accuracy to power tag', () => {
        const tags = getServerModelTags(['chat', 'vision'], 'accuracy', 'stable', ModelTag.Enterprise)
        expect(tags).toEqual([ModelTag.Enterprise, ModelTag.Vision, ModelTag.Power])
    })

    it('includes Vision tag when capability is present', () => {
        const tags = getServerModelTags(
            ['chat', 'vision'],
            ModelTag.Power,
            'stable',
            ModelTag.Enterprise
        )
        expect(tags).toContain(ModelTag.Vision)
    })

    it('includes Waitlist tag for waitlist status', () => {
        const tags = getServerModelTags(['chat'], ModelTag.Power, ModelTag.Waitlist, ModelTag.Pro)
        expect(tags).toContain(ModelTag.Waitlist)
    })

    it('includes Internal tag for internal status', () => {
        const tags = getServerModelTags(['chat'], 'accuracy', ModelTag.Internal, ModelTag.Pro)
        expect(tags).toContain(ModelTag.Internal)
    })
})

describe('toLegacyModel', () => {
    it('converts a model reference to a legacy model ID', () => {
        expect(toLegacyModel('openai::unknown::gpt-3.5-turbo')).toBe('gpt-3.5-turbo')
    })

    it('returns the input if it is already a legacy model ID', () => {
        expect(toLegacyModel('gpt-4')).toBe('gpt-4')
    })

    it('handles empty string input', () => {
        expect(toLegacyModel('')).toBe('')
    })

    it('handles complex model references', () => {
        expect(toLegacyModel('anthropic::20230720::google/claude-2')).toBe('google/claude-2')
    })

    it('preserves the input for non-standard formats', () => {
        expect(toLegacyModel('custom-model-without-provider')).toBe('custom-model-without-provider')
    })

    it('returns as is for model that is not in the valid modelRef format', () => {
        expect(toLegacyModel('a::b:c')).toBe('a::b:c')
    })
})

describe('createModelFromServerModel', () => {
    it('handles enhanced context window when flag is enabled', () => {
        const modelWithEnhancedContext = {
            modelRef: 'test::1::model',
            displayName: 'Test Model',
            modelName: 'test-model',
            capabilities: ['chat'],
            category: 'balanced' as ModelCategory,
            status: 'stable',
            tier: ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 10000,
                maxOutputTokens: 5000,
                maxUserInputTokens: 6000,
            },
        } satisfies ServerModel

        const result = createModelFromServerModel(modelWithEnhancedContext, true)

        expect(result.contextWindow).toEqual({
            input: 6000,
            context: {
                user: 4000, // 10000 - 6000
            },
            output: 5000,
        })
    })

    it('uses standard context window when flag is disabled', () => {
        const modelWithEnhancedContext = {
            modelRef: 'test::1::model',
            displayName: 'Test Model',
            modelName: 'test-model',
            capabilities: ['chat'],
            category: 'balanced' as ModelCategory,
            status: 'stable',
            tier: ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 10000,
                maxOutputTokens: 4000,
                maxUserInputTokens: 6000,
            },
        } satisfies ServerModel

        const result = createModelFromServerModel(modelWithEnhancedContext, false)

        expect(result.contextWindow).toEqual({
            input: 10000,
            output: 4000,
        })
    })

    it('removes Edit usage from models with reasoning capability', () => {
        // model with both reasoning and edit capabilities
        const reasoningEditModel = {
            modelRef: 'anthropic::1::claude-3-sonnet',
            displayName: 'Claude 3 Sonnet',
            modelName: 'claude-3-sonnet',
            capabilities: ['reasoning', 'edit', 'chat'],
            category: 'accuracy',
            status: 'stable',
            tier: ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 100000,
                maxOutputTokens: 4000,
            },
        } satisfies ServerModel

        const result = createModelFromServerModel(reasoningEditModel, false)

        expect(result.usage).toContain(ModelUsage.Chat)
        expect(result.usage).not.toContain(ModelUsage.Edit)
        expect(result.tags).toContain(ModelTag.Power) // Check that other attributes are preserved
    })

    it('preserves Edit usage for models without reasoning capability', () => {
        // similar model but without reasoning capability
        const editOnlyModel = {
            modelRef: 'anthropic::1::claude-instant',
            displayName: 'Claude Instant',
            modelName: 'claude-instant',
            capabilities: ['edit', 'chat'],
            category: ModelTag.Speed,
            status: 'stable',
            tier: ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 100000,
                maxOutputTokens: 4000,
            },
        } satisfies ServerModel

        const result = createModelFromServerModel(editOnlyModel, false)

        expect(result.usage).toContain(ModelUsage.Edit)
        expect(result.usage).toContain(ModelUsage.Chat)
    })

    it('correctly handles models with reasoning but no edit capability', () => {
        // model with reasoning but no edit capability
        const reasoningOnlyModel = {
            modelRef: 'anthropic::1::claude-3-opus',
            displayName: 'Claude 3 Opus',
            modelName: 'claude-3-opus',
            capabilities: ['reasoning', 'chat', 'edit'],
            category: ModelTag.Power,
            status: 'stable',
            tier: ModelTag.Enterprise,
            contextWindow: {
                maxInputTokens: 100000,
                maxOutputTokens: 4000,
            },
        } satisfies ServerModel

        const result = createModelFromServerModel(reasoningOnlyModel, false)

        expect(result.usage).toContain(ModelUsage.Chat)
        expect(result.usage).not.toContain(ModelUsage.Edit)
        // Also check that reasoning is reflected in tags
        expect(result.tags).toContain(ModelTag.Power)
        expect(result.tags).toContain(ModelTag.Enterprise)
        expect(result.tags).not.toContain(ModelUsage.Edit)
    })
})
