import { describe, expect, it } from 'vitest'
import { responseTransformer } from './response-transformer'
import { RESPONSE_TEST_FIXTURES } from './test-fixtures'

describe('responseTransformer', () => {
    describe.each(Object.entries(RESPONSE_TEST_FIXTURES))(
        'responseTransformer with %s',
        (name, fixture) => {
            it(`should correctly transform response for ${name}`, () => {
                const result = responseTransformer(fixture.response, fixture.task, true)
                expect(result).toEqual(fixture.expected)
            })
        }
    )
})
