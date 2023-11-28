import { describe, expect, it } from 'vitest'

import { getFirstLine, getLastLine, getNextNonEmptyLine, getPrevNonEmptyLine, lines } from './utils'

describe('getNextNonEmptyLine', () => {
    it.each(
        withCRLFExamples([
            ['foo\nbar', 'bar'],
            ['foo\nbar\nbaz', 'bar'],
            ['foo\n\nbar', 'bar'],
            ['foo\n  \nbar', 'bar'],
            ['\nbar', 'bar'],
            ['foo', ''],
            ['foo\n', ''],
            ['', ''],
        ])
    )('should work for %j', (suffix, expected) => {
        expect(getNextNonEmptyLine(suffix)).toBe(expected)
    })
})

describe('getPrevNonEmptyLine', () => {
    it.each(
        withCRLFExamples([
            ['foo\nbar', 'foo'],
            ['foo\nbar\nbaz', 'bar'],
            ['foo\n\nbar', 'foo'],
            ['foo\n  \nbar', 'foo'],
            ['bar', ''],
            ['bar\n', 'bar'],
            ['\nbar', ''],
            ['', ''],
        ])
    )('should work for %j', (suffix, expected) => {
        expect(getPrevNonEmptyLine(suffix)).toBe(expected)
    })
})

describe('lines', () => {
    it.each([
        ['foo\nbar\nbaz', ['foo', 'bar', 'baz']],
        ['foo\r\nbar\r\nbaz', ['foo', 'bar', 'baz']],
        ['foo\rbar\r\nbaz', ['foo\rbar', 'baz']],
        ['\n\r\n\r\n\r\n', ['', '', '', '', '']],
        ['\n\n\n', ['', '', '', '']],
    ])('should work for %j', (text, expected) => {
        expect(lines(text)).toEqual(expected)
    })
})

describe('getFirstLine', () => {
    it.each(
        withCRLFExamples([
            ['foo\nbar', 'foo'],
            ['foo\nbar\nbaz', 'foo'],
            ['foo\n\nbar', 'foo'],
            ['foo\n  \nbar', 'foo'],
            ['bar', 'bar'],
            ['bar\n', 'bar'],
            ['\nbar', ''],
            ['', ''],
        ])
    )('should work for %j', (text, expected) => {
        expect(getFirstLine(text)).toEqual(expected)
    })
})

describe('getLastLine', () => {
    it.each(
        withCRLFExamples([
            ['foo\nbar', 'bar'],
            ['foo\nbar\nbaz', 'baz'],
            ['foo\n\nbar', 'bar'],
            ['foo\n  \nbar', 'bar'],
            ['bar', 'bar'],
            ['bar\n', ''],
            ['\nbar', 'bar'],
            ['', ''],
        ])
    )('should work for %j', (text, expected) => {
        expect(getLastLine(text)).toEqual(expected)
    })
})

function withCRLFExamples(examples: string[][]): string[][] {
    const crlfExample = []
    for (const example of examples) {
        crlfExample.push(example.map(line => line.replaceAll('\n', '\r\n')))
    }
    return examples.concat(crlfExample)
}
