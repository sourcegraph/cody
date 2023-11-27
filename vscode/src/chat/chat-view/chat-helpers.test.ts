import { describe, expect, test } from 'vitest'

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import {
    populateCurrentEditorSelectedContextTemplate,
    populateCurrentSelectedCodeContextTemplate,
} from '@sourcegraph/cody-shared/src/prompt/templates'

import * as vscode from '../../testutils/mocks'

import { contextItemsToContextFiles, contextMessageToContextItem, stripContextWrapper } from './chat-helpers'
import { ContextItem } from './SimpleChatModel'

describe('unwrap context snippets', () => {
    test('should wrap and unwrap context item snippets', () => {
        interface TestCase {
            contextItem: ContextItem
        }

        const testCases: TestCase[] = [
            {
                contextItem: {
                    uri: vscode.Uri.file('test.ts'),
                    range: new vscode.Range(0, 1, 2, 3),
                    text: '// This is code context',
                },
            },
            {
                contextItem: {
                    uri: vscode.Uri.file('doc.md'),
                    range: new vscode.Range(0, 1, 2, 3),
                    text: 'This is markdown context',
                },
            },
        ]

        for (const testCase of testCases) {
            const contextFiles = contextItemsToContextFiles([testCase.contextItem])
            const contextMessages = CodebaseContext.makeContextMessageWithResponse({
                file: contextFiles[0],
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
                input: populateCurrentEditorSelectedContextTemplate('// This is the code', 'test.ts'),
                expOut: '// This is the code',
            },
            {
                input: populateCurrentSelectedCodeContextTemplate('// This is the code', 'test.ts'),
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
