import { describe, expect, it } from 'vitest'

import {
    createAsyncIteratorStream,
    getFirstLine,
    getLastLine,
    getNextNonEmptyLine,
    getPrevNonEmptyLine,
    lines,
    newlineChunked,
} from './utils'

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

describe('createAsyncIteratorStream', () => {
    it('yields the right items', async () => {
        const stream = createAsyncIteratorStream()

        stream.onChunk('one')
        stream.onChunk('two')
        stream.onChunk('three')
        stream.onEnd()

        const chunks = []
        for await (const x of stream) {
            chunks.push(x)
        }

        expect(chunks).toEqual(['one', 'two', 'three'])
    })

    it('yields the right items if the async iterator is immediately started', async () => {
        const stream = createAsyncIteratorStream()

        setTimeout(() => {
            stream.onChunk('one')
            stream.onChunk('two')
            stream.onChunk('three')
            stream.onEnd()
        }, 0)

        const chunks = []
        for await (const x of stream) {
            chunks.push(x)
        }

        expect(chunks).toEqual(['one', 'two', 'three'])
    })
})

describe('newlineChunked', () => {
    it('creates the right chunks', async () => {
        const inputStream = createAsyncIteratorStream<string>()
        inputStream.onChunk('one\ntwo\nthree')

        const outputStream = newlineChunked(inputStream)

        inputStream.onChunk(' four\n')
        inputStream.onChunk('fi')
        inputStream.onChunk('ve\nsix')
        inputStream.onEnd()

        const chunks = []
        for await (const x of outputStream) {
            chunks.push(x)
        }

        expect(chunks).toEqual(['one\n', 'two\n', 'three four\n', 'five\n', 'six'])
    })

    it('creates the right chunks if the async iterator is immediately started', async () => {
        const inputStream = createAsyncIteratorStream<string>()
        inputStream.onChunk('one\ntwo\nthree')

        const outputStream = newlineChunked(inputStream)

        setTimeout(() => {
            inputStream.onChunk(' four\n')
            inputStream.onChunk('fi')
            inputStream.onChunk('ve\nsix')
            inputStream.onEnd()
        }, 0)

        const chunks = []
        for await (const x of outputStream) {
            chunks.push(x)
        }

        expect(chunks).toEqual(['one\n', 'two\n', 'three four\n', 'five\n', 'six'])
    })
})
