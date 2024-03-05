import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'

import type { ContextItemFile } from '../..'
import { verifyContextFilesFromInput } from './user-context'

describe('verifyContextFilesFromInput', () => {
    it('returns empty array if no contextFilesMap provided', () => {
        const input = '@foo.ts'
        const contextFiles = verifyContextFilesFromInput(input)

        expect(contextFiles).toEqual([])
    })

    it('returns empty array if contextFilesMap is empty', () => {
        const input = '@foo.ts'
        const contextFilesMap = new Map()
        const contextFiles = verifyContextFilesFromInput(input, contextFilesMap)

        expect(contextFiles).toEqual([])
    })

    it('returns only context files referenced in input', () => {
        const input = '@foo.ts @bar.ts'
        const contextFilesMap = new Map<string, ContextItemFile>([
            ['foo.ts', { uri: URI.file('foo.ts'), type: 'file' }],
            ['baz.ts', { uri: URI.file('baz.ts'), type: 'file' }],
        ])

        const contextFiles = verifyContextFilesFromInput(input, contextFilesMap)

        expect(contextFiles).toEqual([{ uri: URI.file('foo.ts'), type: 'file' }])
    })

    it('sets range property if line numbers included', () => {
        const input = '@foo.ts:1-2'
        const contextFilesMap = new Map<string, ContextItemFile>([
            ['foo.ts', { uri: URI.file('foo.ts'), type: 'file' }],
        ])

        const contextFiles = verifyContextFilesFromInput(input, contextFilesMap)

        expect(contextFiles).toEqual([
            {
                type: 'file',
                uri: URI.file('foo.ts'),
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 1, character: 0 },
                },
            },
        ])
    })

    it('sets range property for all at-mentioned with and without line numbers', () => {
        const input = 'Explain @foo.ts:1-2 in @foo.ts, expand @foo.ts:1'
        const contextFilesMap = new Map<string, ContextItemFile>([
            ['foo.ts', { uri: URI.file('foo.ts'), type: 'file' }],
        ])

        const contextFiles = verifyContextFilesFromInput(input, contextFilesMap)

        expect(contextFiles).toEqual([
            {
                range: undefined,
                type: 'file',
                uri: URI.file('foo.ts'),
            },
            {
                type: 'file',
                uri: URI.file('foo.ts'),
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 0 },
                },
            },
            {
                type: 'file',
                uri: URI.file('foo.ts'),
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 1, character: 0 },
                },
            },
        ])
    })

    it('returns empty array for invalid line numbers', () => {
        const input = '@foo.ts:5-1'
        const contextFilesMap = new Map<string, ContextItemFile>([
            ['foo.ts', { uri: URI.file('foo.ts'), type: 'file' }],
        ])

        const contextFiles = verifyContextFilesFromInput(input, contextFilesMap)

        expect(contextFiles).toEqual([])
    })

    it('sets range property even if only start line number is included', () => {
        const input = '@foo.ts:1'
        const contextFilesMap = new Map<string, ContextItemFile>([
            ['foo.ts', { uri: URI.file('foo.ts'), type: 'file' }],
        ])

        const contextFiles = verifyContextFilesFromInput(input, contextFilesMap)

        expect(contextFiles).toEqual([
            {
                type: 'file',
                uri: URI.file('foo.ts'),
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 0 },
                },
            },
        ])
    })
})
