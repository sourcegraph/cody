import { describe, expect, it } from 'vitest'
import { ModelTag } from '..'
import { getServerModelTags, toLegacyModel } from './model'

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
