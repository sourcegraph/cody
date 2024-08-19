import { truncateTextStart } from './truncation'

import { describe, expect, it } from 'vitest'

describe('truncateTextStart', () => {
    it('truncates text to the specified number of tokens', async () => {
        const text = 'Hello world, this is a test string'
        const truncated = await truncateTextStart(text, 5)

        expect(truncated).toBe('this is a test string')
    })

    it('returns original text if tokens is greater than text length', async () => {
        const text = 'Hello'
        const truncated = await truncateTextStart(text, 10)

        expect(truncated).toBe('Hello')
    })

    it('truncates to the end of the last token if maxTokens is mid-token', async () => {
        const text = 'Hello world test string'
        const truncated = await truncateTextStart(text, 2)

        expect(truncated).toBe('test string')
    })
})
