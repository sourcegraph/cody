import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'

import { Result } from '@sourcegraph/cody-shared/src/local-context'

import { toContextResult } from './symf'

const createMockURI = (path: string) => {
    return URI.from({ path, scheme: 'file', authority: '', query: '', fragment: '' })
}

describe('toContextResult', () => {
    const source = 'symf'
    const mockedContent = 'foo\nbar\nfoo'

    it('converts symf results to context results', async () => {
        const symfResults: Result[] = [
            {
                fqname: 'my.package.Foo',
                name: 'Foo',
                type: 'class',
                doc: 'This is the Foo class',
                exported: true,
                lang: 'ts',
                file: '/path/to/file1.ts',
                range: {
                    startByte: 0,
                    endByte: 100,
                    startPoint: { row: 0, col: 0 },
                    endPoint: { row: 10, col: 10 },
                },
                summary: 'The Foo class does something',
            },
            {
                fqname: 'my.package.Bar',
                name: 'Bar',
                type: 'function',
                doc: '',
                exported: false,
                lang: 'py',
                file: '/path/to/file2.py',
                range: {
                    startByte: 0,
                    endByte: 3,
                    startPoint: { row: 0, col: 0 },
                    endPoint: { row: 6, col: 0 },
                },
                summary: '',
            },
            {
                fqname: 'my.package.Baz',
                name: 'Baz',
                type: 'function',
                doc: 'This is the Baz function',
                exported: true,
                lang: 'ts',
                file: '/path/to/file3.ts',
                range: {
                    startByte: 0,
                    endByte: 100,
                    startPoint: { row: 5, col: 10 },
                    endPoint: { row: 8, col: 15 },
                },
                summary: 'The Baz function does something',
            },
            {
                fqname: 'my.package.A',
                name: 'A',
                type: 'class',
                doc: 'This is the A class',
                exported: false,
                lang: 'ts',
                file: '/path/to/file4.ts',
                range: {
                    startByte: 0,
                    endByte: 100,
                    startPoint: { row: 3, col: 5 },
                    endPoint: { row: 12, col: 20 },
                },
                summary: 'The B class does something else',
            },
            {
                fqname: 'my.package.B',
                name: 'B',
                type: 'interface',
                doc: 'This is the B interface',
                exported: true,
                lang: 'ts',
                file: '/path/to/file5.ts',
                range: {
                    startByte: 0,
                    endByte: 100,
                    startPoint: { row: 1, col: 1 },
                    endPoint: { row: 5, col: 15 },
                },
                summary: 'The B interface defines something',
            },
        ]

        const expected = [
            {
                fileName: '/path/to/file1.ts',
                revision: 'class',
                content: mockedContent,
                source,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 10, character: 10 },
                },
                uri: URI.file('/path/to/file1.ts'),
            },
            {
                fileName: '/path/to/file2.py',
                revision: 'function',
                content: mockedContent,
                source,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 6, character: 0 },
                },
                uri: createMockURI('/path/to/file2.py'),
            },
            {
                fileName: '/path/to/file3.ts',
                revision: 'function',
                content: mockedContent,
                source,
                range: {
                    start: { line: 5, character: 10 },
                    end: { line: 8, character: 15 },
                },
                uri: createMockURI('/path/to/file3.ts'),
            },
            {
                fileName: '/path/to/file4.ts',
                range: {
                    start: { line: 3, character: 5 },
                    end: { line: 12, character: 20 },
                },
                revision: 'class',
                content: mockedContent,
                source,
                uri: createMockURI('/path/to/file4.ts'),
            },
            {
                fileName: '/path/to/file5.ts',
                range: {
                    start: { line: 1, character: 1 },
                    end: { line: 5, character: 15 },
                },
                revision: 'interface',
                content: mockedContent,
                source,
                uri: createMockURI('/path/to/file5.ts'),
            },
        ]

        const results = await toContextResult([symfResults])
        expect(results).toEqual(expected)
    })

    it('handles empty results array', async () => {
        const results = await toContextResult([])
        expect(results).toEqual([])
    })

    it('handles invalid files, e.g. file with no content', async () => {
        const symfResults: Result[] = [
            {
                fqname: 'empty',
                name: 'Empty',
                type: 'function',
                doc: '',
                exported: false,
                lang: 'ts',
                file: '/path/to/empty.ts',
                range: {
                    startByte: 0,
                    endByte: 0,
                    startPoint: { row: 0, col: 0 },
                    endPoint: { row: 0, col: 0 },
                },
                summary: '',
            },
        ]

        const results = await toContextResult([symfResults])
        expect(results).toEqual([])
    })
})
