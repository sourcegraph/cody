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

        // retains safe values in metadata
        expect(metadata).toStrictEqual({
            number: 3,
            float: 3.14,
            true: 1,
            false: 0,
            // shallow-extract safe value from object
            'object.safeVar': 3,
        })

        // retains arbitrary values in privateMetadata
        expect(privateMetadata).toStrictEqual({
            string: 'string',
            object: { key: 'value', safeVar: 3 },
        })

        // accounts for all values
        expect(Object.keys({ ...metadata, ...privateMetadata })).toEqual(
            expect.arrayContaining(Object.keys(originalParameters))
        )

        // sanity-check original parameters are not mutated
        expect(parameters).toStrictEqual(originalParameters)
    })

    it('deep safe flatten', () => {
        const parameters = {
            object: { key: 'value', safeVar: 3, deepObject: { alsoSafeVar: 4, foo: 'bar' } },
        }
        const originalParameters = { ...parameters }
        const { metadata, privateMetadata } = splitSafeMetadata(parameters)

        // retains safe values in metadata
        expect(metadata).toEqual({
            'object.safeVar': 3,
            'object.deepObject.alsoSafeVar': 4,
        })

        // retains arbitrary values in privateMetadata
        expect(privateMetadata).toEqual({
            object: { key: 'value', safeVar: 3, deepObject: { alsoSafeVar: 4, foo: 'bar' } },
        })

        // accounts for all values
        expect(Object.keys({ ...metadata, ...privateMetadata })).toEqual(
            expect.arrayContaining(Object.keys(originalParameters))
        )

        // sanity-check original parameters are not mutated
        expect(parameters).toStrictEqual(originalParameters)
    })
})
