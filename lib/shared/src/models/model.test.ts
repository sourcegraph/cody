import { describe, expect, it } from 'vitest'
import { ModelTag } from '..'
import { getServerModelTags } from './model'

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
