import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import { range } from '../testutils/textDocument'

import { getCurrentDocContext } from './get-current-doc-context'
import { documentAndPosition } from './test-helpers'

function testGetCurrentDocContext(code: string, context?: vscode.InlineCompletionContext) {
    const { document, position } = documentAndPosition(code)

    return getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 100,
        maxSuffixLength: 100,
        enableExtendedTriggers: true,
        context,
    })
}

describe('getCurrentDocContext', () => {
    it('returns `docContext` for a function block', () => {
        const result = testGetCurrentDocContext('function myFunction() {\n  █')

        expect(result).toEqual({
            prefix: 'function myFunction() {\n  ',
            suffix: '',
            contextRange: expect.any(Object),
            currentLinePrefix: '  ',
            currentLineSuffix: '',
            prevNonEmptyLine: 'function myFunction() {',
            nextNonEmptyLine: '',
            multilineTrigger: '{',
            injectedPrefix: null,
        })
    })

    it('returns `docContext` for an if block', () => {
        const result = testGetCurrentDocContext('const x = 1\nif (true) {\n  █\n}')

        expect(result).toEqual({
            prefix: 'const x = 1\nif (true) {\n  ',
            suffix: '\n}',
            contextRange: expect.any(Object),
            currentLinePrefix: '  ',
            currentLineSuffix: '',
            prevNonEmptyLine: 'if (true) {',
            nextNonEmptyLine: '}',
            multilineTrigger: '{',
            injectedPrefix: null,
        })
    })

    it('returns correct multi-line trigger when `enableExtendedTriggers: true`', () => {
        const result = testGetCurrentDocContext('const arr = [█\n];')

        expect(result).toEqual({
            prefix: 'const arr = [',
            suffix: '\n];',
            contextRange: expect.any(Object),
            currentLinePrefix: 'const arr = [',
            currentLineSuffix: '',
            prevNonEmptyLine: '',
            nextNonEmptyLine: '];',
            multilineTrigger: '[',
            injectedPrefix: null,
        })
    })

    it('removes \\r from the same current line suffix, prefix, and suffix', () => {
        const result = testGetCurrentDocContext('console.log(1337);\r\nconst arr = [█\r\n];')

        expect(result).toEqual({
            prefix: 'console.log(1337);\nconst arr = [',
            suffix: '\n];',
            contextRange: expect.any(Object),
            currentLinePrefix: 'const arr = [',
            currentLineSuffix: '',
            prevNonEmptyLine: 'console.log(1337);',
            nextNonEmptyLine: '];',
            multilineTrigger: '[',
            injectedPrefix: null,
        })
    })

    it('injects the selected item from the suggestions widget into the prompt', () => {
        const result = testGetCurrentDocContext(
            dedent`
                console.a█
            `,
            {
                triggerKind: 0,
                selectedCompletionInfo: {
                    range: range(0, 8, 0, 10),
                    text: 'assert',
                },
            }
        )

        expect(result).toEqual({
            prefix: 'console.assert',
            suffix: '',
            contextRange: expect.any(Object),
            currentLinePrefix: 'console.assert',
            currentLineSuffix: '',
            prevNonEmptyLine: '',
            nextNonEmptyLine: '',
            multilineTrigger: null,
            injectedPrefix: 'ssert',
        })
    })

    it('handles suggestion widget items at the end of the word', () => {
        const result = testGetCurrentDocContext(
            dedent`
                console█
            `,
            {
                triggerKind: 0,
                selectedCompletionInfo: {
                    range: range(0, 0, 0, 7),
                    text: 'console',
                },
            }
        )

        expect(result).toEqual({
            prefix: 'console',
            suffix: '',
            contextRange: expect.any(Object),
            currentLinePrefix: 'console',
            currentLineSuffix: '',
            prevNonEmptyLine: '',
            nextNonEmptyLine: '',
            multilineTrigger: null,
            injectedPrefix: null,
        })
    })

    it('returns the right range for the document context', () => {
        const { document, position } = documentAndPosition(
            dedent`
                function bubbleSort(arr) {
                    for (let i = 0; i < arr.length; i++) {
                        for (let j = 0; j < arr.length; j++) {
                            if (arr[i] > arr[j]) {

                                let temp = █;

                                arr[i] = arr[j];
                                arr[j] = temp;
                            }
                        }
                    }
                }
            `
        )

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 140,
            maxSuffixLength: 60,
            enableExtendedTriggers: true,
        })
        expect(docContext.contextRange).toMatchInlineSnapshot(`
          Range {
            "end": Position {
              "character": 32,
              "line": 7,
            },
            "start": Position {
              "character": 0,
              "line": 2,
            },
          }
        `)
    })
})
