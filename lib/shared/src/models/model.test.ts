import { describe, expect, it } from 'vitest'
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
    it('removes Edit usage from models with reasoning capability', () => {
        // Arrange - model with both reasoning and edit capabilities
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

        // Act
        const result = createModelFromServerModel(reasoningEditModel)

        // Assert
        expect(result.usage).toContain(ModelUsage.Chat)
        expect(result.usage).not.toContain(ModelUsage.Edit)
        expect(result.tags).toContain(ModelTag.Power) // Check that other attributes are preserved
    })

    it('preserves Edit usage for models without reasoning capability', () => {
        // Arrange - similar model but without reasoning capability
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

        // Act
        const result = createModelFromServerModel(editOnlyModel)

        // Assert
        expect(result.usage).toContain(ModelUsage.Edit)
        expect(result.usage).toContain(ModelUsage.Chat)
    })

    it('correctly handles models with reasoning but no edit capability', () => {
        // Arrange - model with reasoning but no edit capability
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

        // Act
        const result = createModelFromServerModel(reasoningOnlyModel)

        // Assert
        expect(result.usage).toContain(ModelUsage.Chat)
        expect(result.usage).not.toContain(ModelUsage.Edit)
        // Also check that reasoning is reflected in tags
        expect(result.tags).toContain(ModelTag.Power)
        expect(result.tags).toContain(ModelTag.Enterprise)
        expect(result.tags).not.toContain(ModelUsage.Edit)
    })
})
