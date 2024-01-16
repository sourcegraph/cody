import { describe, expect, test } from 'vitest'

import { testFileUri, type ContextFile } from '@sourcegraph/cody-shared'
import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import {
    populateCurrentEditorSelectedContextTemplate,
    populateCurrentSelectedCodeContextTemplate,
} from '@sourcegraph/cody-shared/src/prompt/templates'

import * as vscode from '../../testutils/mocks'

import {
    contextItemsToContextFiles,
    contextMessageToContextItem,
    getChatPanelTitle,
    stripContextWrapper,
} from './chat-helpers'
import { type ContextItem } from './SimpleChatModel'

describe('unwrap context snippets', () => {
    test('should wrap and unwrap context item snippets', () => {
        interface TestCase {
            contextItem: ContextItem
        }

        const testCases: TestCase[] = [
            {
                contextItem: {
                    uri: testFileUri('test.ts'),
                    range: new vscode.Range(0, 1, 2, 3),
                    source: 'editor',
                    text: '// This is code context',
                },
            },
            {
                contextItem: {
                    uri: testFileUri('doc.md'),
                    range: new vscode.Range(0, 1, 2, 3),
                    source: 'editor',
                    text: 'This is markdown context',
                },
            },
        ]

        for (const testCase of testCases) {
            const contextFiles = contextItemsToContextFiles([testCase.contextItem])
            const contextMessages = CodebaseContext.makeContextMessageWithResponse({
                file: contextFiles[0] as ContextFile & Required<Pick<ContextFile, 'uri'>>,
                results: [contextFiles[0].content || ''],
            })
            const contextItem = contextMessageToContextItem(contextMessages[0])
            expect(prettyJSON(contextItem)).toEqual(prettyJSON(testCase.contextItem))
        }
    })

    test('should unwrap context from context message', () => {
        interface TestCase {
            input: string
            expOut: string
        }

        const testCases: TestCase[] = [
            {
                input: populateCurrentEditorSelectedContextTemplate('// This is the code', testFileUri('test.ts')),
                expOut: '// This is the code',
            },
            {
                input: populateCurrentSelectedCodeContextTemplate('// This is the code', testFileUri('test.ts')),
                expOut: '// This is the code',
            },
        ]

        for (const testCase of testCases) {
            const output = stripContextWrapper(testCase.input)
            expect(output).toEqual(testCase.expOut)
        }
    })
})

function prettyJSON(obj: any): string {
    if (obj === null) {
        return 'null'
    }
    if (obj === undefined) {
        return 'undefined'
    }
    return JSON.stringify(obj, Object.keys(obj).sort())
}

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
})
