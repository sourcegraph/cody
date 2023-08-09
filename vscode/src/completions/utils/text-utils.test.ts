import { describe, expect, it } from 'vitest'

import { getNextNonEmptyLine, getPrevNonEmptyLine } from './text-utils'

describe('getNextNonEmptyLine', () => {
    it.each([
        ['foo\nbar', 'bar'],
        ['foo\nbar\nbaz', 'bar'],
        ['foo\n\nbar', 'bar'],
        ['foo\n  \nbar', 'bar'],
        ['\nbar', 'bar'],
        ['foo', ''],
        ['foo\n', ''],
        ['', ''],
    ])('should work for %s', (suffix, expected) => {
        expect(getNextNonEmptyLine(suffix)).toBe(expected)
    })
})

describe('getPrevNonEmptyLine', () => {
    it.each([
        ['foo\nbar', 'foo'],
        ['foo\nbar\nbaz', 'foo'],
        ['foo\n\nbar', 'foo'],
        ['foo\n  \nbar', 'foo'],
        ['bar', ''],
        ['bar\n', 'bar'],
        ['\nbar', ''],
        ['', ''],
    ])('should work for %s', (suffix, expected) => {
        expect(getPrevNonEmptyLine(suffix)).toBe(expected)
    })
})
