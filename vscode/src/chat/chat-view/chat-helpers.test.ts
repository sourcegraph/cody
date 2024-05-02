import { describe, expect, it, test } from 'vitest'

import { getChatPanelTitle } from './chat-helpers'

describe('getChatPanelTitle', () => {
    test('returns default title when no lastDisplayText', () => {
        const result = getChatPanelTitle()
        expect(result).toEqual('New Chat')
    })

    test('long titles will be truncated', () => {
        const longTitle = 'This is a very long title that should get truncated by the function'
        const result = getChatPanelTitle(longTitle)
        expect(result).toEqual('This is a very long title...')
    })

    test('keeps command key', () => {
        const title = '/explain this symbol'
        const result = getChatPanelTitle(title)
        expect(result).toEqual('/explain this symbol')
    })

    test('keeps command key with file path', () => {
        const title = '/explain [_@a.ts_](a.ts)'
        const result = getChatPanelTitle(title)
        expect(result).toEqual('/explain @a.ts')
    })

    test('removes markdown links', () => {
        const title = 'Summarize this file [_@a.ts_](a.ts)'
        const result = getChatPanelTitle(title)
        expect(result).toEqual('Summarize this file @a.ts')
    })

    test('removes multiple markdown links', () => {
        const title = '[_@a.py_](a.py) [_@b.py_](b.py) explain'
        const result = getChatPanelTitle(title)
        expect(result).toEqual('@a.py @b.py explain')
    })

    test('truncates long title with multiple markdown links', () => {
        const title = 'Explain the relationship...'
        const result = getChatPanelTitle(title)
        expect(result).toEqual('Explain the relationship....')
    })

    it('should trim leading and trailing whitespace from the input string', () => {
        expect(getChatPanelTitle('\n\nExplain\n\n')).toEqual('Explain')
    })

    it('should return the first non-empty line from the input string', () => {
        expect(getChatPanelTitle('\nInclude this\nExclude this\n')).toEqual('Include this')
    })
})
