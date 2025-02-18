import { describe, expect, it } from 'vitest'
import { extractThinkContent } from './utils'

describe('extractThinkContent', () => {
    it('extracts content from complete think tags at the start', () => {
        const input = '<think>Planning steps</think>Here is the code'
        const result = extractThinkContent(input)

        expect(result).toEqual({
            displayContent: 'Here is the code',
            thinkContent: 'Planning steps',
            isThinking: false,
        })
    })

    it('ignores think tags that do not start at the beginning', () => {
        const input = 'Code here<think>Step 2</think>More code'
        const result = extractThinkContent(input)

        expect(result).toEqual({
            displayContent: 'Code here<think>Step 2</think>More code',
            thinkContent: '',
            isThinking: false,
        })
    })

    it('handles unclosed think tag at the start', () => {
        const input = '<think>Incomplete thought'
        const result = extractThinkContent(input)

        expect(result).toEqual({
            displayContent: '',
            thinkContent: 'Incomplete thought',
            isThinking: true,
        })
    })

    it('ignores unclosed think tag not at the start', () => {
        const input = 'Middle<think>Incomplete'
        const result = extractThinkContent(input)

        expect(result).toEqual({
            displayContent: 'Middle<think>Incomplete',
            thinkContent: '',
            isThinking: false,
        })
    })

    it('returns empty think content for input without think tags', () => {
        const input = 'Regular content without think tags'
        const result = extractThinkContent(input)

        expect(result).toEqual({
            displayContent: 'Regular content without think tags',
            thinkContent: '',
            isThinking: false,
        })
    })

    it('keeps isThinking true when think tag is closed but no content follows', () => {
        const input = '<think>Completed thought</think>'
        const result = extractThinkContent(input)

        expect(result).toEqual({
            displayContent: '',
            thinkContent: 'Completed thought',
            isThinking: true,
        })
    })
})
