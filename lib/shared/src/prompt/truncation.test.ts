import { truncateText, truncateTextStart } from './truncation'

import { describe, expect, it } from 'vitest'

describe('truncateText', () => {
    it('truncates text to max tokens', () => {
        const text = 'Hello world, this is a test string for truncation'
        const maxTokens = 5
        const truncated = truncateText(text, maxTokens)

        expect(truncated).toBe('Hello world, this is')
    })

    it('returns original text if tokens are less than max', () => {
        const text = 'Hello'
        const maxTokens = 10
        const truncated = truncateText(text, maxTokens)

        expect(truncated).toBe('Hello')
    })

    it('handles empty text', () => {
        const text = ''
        const maxTokens = 5
        const truncated = truncateText(text, maxTokens)

        expect(truncated).toBe('')
    })
})

describe('truncateTextStart', () => {
    it('truncates text to the specified number of tokens', () => {
        const text = 'Hello world, this is a test string'
        const truncated = truncateTextStart(text, 5)

        expect(truncated).toBe(', this is a test string')
    })

    it('returns original text if tokens is greater than text length', () => {
        const text = 'Hello'
        const truncated = truncateTextStart(text, 10)

        expect(truncated).toBe('Hello')
    })

    it('truncates to the end of the last token if maxTokens is mid-token', () => {
        const text = 'Hello world test string'
        const truncated = truncateTextStart(text, 2)

        expect(truncated).toBe(' world test string')
    })
})
