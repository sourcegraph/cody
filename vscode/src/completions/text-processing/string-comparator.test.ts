import { describe, expect, it } from 'vitest'

import { isAlmostTheSameString } from './string-comparator'

describe('isAlmostTheSameString', () => {
    it.each([
        [true, '', ''],
        [true, 'return []', ' return []'],
        [true, 'const abortController = new AbortController()', 'const networkController = new AbortController()'],
        [
            true,
            'const currentFilePath = path.normalize(document.fileName)',
            'const filePath = path.normalize(document.fileName)',
        ],
        [
            false,
            "console.log('Hello world', getSumAAndB(a, b))",
            "console.error('Error log', getDBConnection(context))",
        ],
        [false, '    chatId: z.string(),', '    prompt: z.string(),'],
        [
            false,
            '    public get(key: RequestParams): InlineCompletionItemWithAnalytics[] | undefined {',
            '    public set(key: RequestParams, entry: InlineCompletionItemWithAnalytics[]): void {',
        ],
    ])('should return %s for strings %j and %j', (expected, stringA, stringB) => {
        expect(isAlmostTheSameString(stringA, stringB)).toBe(expected)
    })
})
