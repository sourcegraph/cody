import { describe, expect, test } from 'vitest'

import { filterFilesToExclude } from './exclude-files'
import { ContextMessage } from './messages'

describe('filterFilesToExclude', () => {
    test('returns empty array if no excludedFiles', async () => {
        const result = await filterFilesToExclude(Promise.resolve([]), [])
        expect(result).toEqual([])
    })

    test('filters out messages with matching filenames', async () => {
        const messages: Promise<ContextMessage[]> = Promise.resolve([
            { speaker: 'human', file: { fileName: 'file1.js' } },
            { speaker: 'assistant', text: 'ok' },
            { speaker: 'human', file: { fileName: 'file2.js' } },
            { speaker: 'assistant', text: 'ok' },
        ])
        const result = await filterFilesToExclude(messages, ['file1.js'])
        expect(result).toEqual([
            { speaker: 'human', file: { fileName: 'file2.js' } },
            { speaker: 'assistant', text: 'ok' },
        ])
    })

    test('returns unfiltered messages if no match was found', async () => {
        const messages: Promise<ContextMessage[]> = Promise.resolve([
            { speaker: 'human', file: { fileName: 'file1.js' } },
            { speaker: 'assistant', text: 'ok' },
            { speaker: 'human', file: { fileName: 'file3.js' } },
            { speaker: 'assistant', text: 'ok' },
        ])
        const result = await filterFilesToExclude(messages, ['file2.js'])
        expect(result).toEqual([
            { speaker: 'human', file: { fileName: 'file1.js' } },
            { speaker: 'assistant', text: 'ok' },
            { speaker: 'human', file: { fileName: 'file3.js' } },
            { speaker: 'assistant', text: 'ok' },
        ])
    })

    test('returns empty array if no messages', async () => {
        const messages: Promise<ContextMessage[]> = Promise.resolve([])
        const result = await filterFilesToExclude(messages, ['file.js'])
        expect(result).toEqual([])
    })

    test('return empty array if the only interaction includes excluded file', async () => {
        const messages: Promise<ContextMessage[]> = Promise.resolve([
            { speaker: 'human', file: { fileName: 'file2.js' } },
            { speaker: 'assistant', text: 'ok' },
        ])
        const result = await filterFilesToExclude(messages, ['file2.js'])
        expect(result).toEqual([])
    })

    test('includes messages without filename after filtering out matches', async () => {
        const messages: Promise<ContextMessage[]> = Promise.resolve([
            { speaker: 'human', file: { fileName: 'file1.js' } },
            { speaker: 'assistant', text: 'ok' },
            { speaker: 'human', text: 'hello' },
            { speaker: 'assistant' },
        ])
        const result = await filterFilesToExclude(messages, ['file1.js'])
        expect(result).toEqual([{ speaker: 'human', text: 'hello' }, { speaker: 'assistant' }])
    })
})
