import { describe, expect, it } from 'vitest'

import { splitSafeMetadata } from './telemetry-v2'

describe('splitSafeMetadata', () => {
    it('splits into safe and unsafe', () => {
        const parameters = {
            number: 3,
            float: 3.14,
            true: true,
            false: false,

            string: 'string',
            object: { key: 'value', safeVar: 3 },
        }
        const originalParameters = { ...parameters }
        const { metadata, privateMetadata } = splitSafeMetadata(parameters)

        it('retains safe values in metadata', () => {
            expect(metadata).toStrictEqual({
                number: 3,
                float: 3.14,
                true: 1,
                false: 0,
                // shallow-extract safe value from object
                'object.safeVar': 3,
            })
        })

        it('retains arbitrary values in privateMetadata', () => {
            expect(privateMetadata).toStrictEqual({
                string: 'string',
                object: { key: 'value', safeVar: 3 },
            })
        })

        it('accounts for all values', () => {
            expect(Object.keys({ ...metadata, ...privateMetadata })).contains(Object.keys(originalParameters))
        })

        // sanity-check original parameters are not mutated
        expect(parameters).toStrictEqual(originalParameters)
    })
})
