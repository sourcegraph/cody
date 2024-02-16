import { describe, expect, it } from 'vitest'
import { RESPONSE_TEST_FIXTURES } from './test-fixtures'
import { responseTransformer } from './response-transformer'

describe('responseTransformer', () => {
    describe.each(Object.entries(RESPONSE_TEST_FIXTURES))(
        'responseTransformer with %s',
        (name, fixture) => {
            it(`should correctly transform response for ${name}`, () => {
                const result = responseTransformer(fixture.response)
                expect(result).toEqual(fixture.expected)
            })
        }
    )
})
