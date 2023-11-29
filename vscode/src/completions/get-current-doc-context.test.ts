import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import { range } from '../testutils/textDocument'

import { getContextRange } from './doc-context-getters'
import { getCurrentDocContext } from './get-current-doc-context'
import { documentAndPosition } from './test-helpers'

function testGetCurrentDocContext(code: string, context?: vscode.InlineCompletionContext) {
    const { document, position } = documentAndPosition(code)

    return getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 100,
        maxSuffixLength: 100,
        context,
        dynamicMultlilineCompletions: false,
    })
}

describe('getCurrentDocContext', () => {
    it('returns `docContext` for a function block', () => {
        const result = testGetCurrentDocContext('function myFunction() {\n  █')

        expect(result).toEqual({
            prefix: 'function myFunction() {\n  ',
            suffix: '',
            currentLinePrefix: '  ',
            currentLineSuffix: '',
            prevNonEmptyLine: 'function myFunction() {',
            nextNonEmptyLine: '',
            multilineTrigger: '{',
            multilineTriggerPosition: {
                character: 23,
                line: 0,
            },
            injectedPrefix: null,
            position: { character: 2, line: 1 },
        })
    })

    it('returns `docContext` for an if block', () => {
        const result = testGetCurrentDocContext('const x = 1\nif (true) {\n  █\n}')

        expect(result).toEqual({
            prefix: 'const x = 1\nif (true) {\n  ',
            suffix: '\n}',
            currentLinePrefix: '  ',
            currentLineSuffix: '',
            prevNonEmptyLine: 'if (true) {',
            nextNonEmptyLine: '}',
            multilineTrigger: '{',
            multilineTriggerPosition: {
                character: 11,
                line: 1,
            },
            injectedPrefix: null,
            position: { character: 2, line: 2 },
        })
    })

    it('returns correct multi-line trigger', () => {
        const result = testGetCurrentDocContext('const arr = [█\n];')

        expect(result).toEqual({
            prefix: 'const arr = [',
            suffix: '\n];',
            currentLinePrefix: 'const arr = [',
            currentLineSuffix: '',
            prevNonEmptyLine: '',
            nextNonEmptyLine: '];',
            multilineTrigger: '[',
            multilineTriggerPosition: {
                character: 13,
                line: 0,
            },
            injectedPrefix: null,
            position: { character: 13, line: 0 },
        })
    })

    it('removes \\r from the same current line suffix, prefix, and suffix', () => {
        const result = testGetCurrentDocContext('console.log(1337);\r\nconst arr = [█\r\n];')

        expect(result).toEqual({
            prefix: 'console.log(1337);\nconst arr = [',
            suffix: '\n];',
            currentLinePrefix: 'const arr = [',
            currentLineSuffix: '',
            prevNonEmptyLine: 'console.log(1337);',
            nextNonEmptyLine: '];',
            multilineTrigger: '[',
            multilineTriggerPosition: {
                character: 13,
                line: 1,
            },
            injectedPrefix: null,
            position: { character: 13, line: 1 },
        })
    })

    it('injects the selected item from the suggestions widget into the prompt when it overlaps', () => {
        const result = testGetCurrentDocContext(
            dedent`
                console.a█
            `,
            {
                triggerKind: 0,
                selectedCompletionInfo: {
                    range: range(0, 7, 0, 9),
                    text: '.assert',
                },
            }
        )

        expect(result).toEqual({
            prefix: 'console.assert',
            suffix: '',
            currentLinePrefix: 'console.assert',
            currentLineSuffix: '',
            prevNonEmptyLine: '',
            nextNonEmptyLine: '',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: 'ssert',
            position: { character: 9, line: 0 },
        })
    })

    it('injects the selected item from the suggestions widget into the prompt when it does not overlap', () => {
        const result = testGetCurrentDocContext(
            dedent`
                // some line before
                console.█
            `,
            {
                triggerKind: 0,
                selectedCompletionInfo: {
                    range: range(1, 8, 1, 8),
                    text: 'log',
                },
            }
        )

        expect(result).toEqual({
            prefix: '// some line before\nconsole.log',
            suffix: '',
            currentLinePrefix: 'console.log',
            currentLineSuffix: '',
            prevNonEmptyLine: '// some line before',
            nextNonEmptyLine: '',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: 'log',
            position: { character: 8, line: 1 },
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
            currentLinePrefix: 'console',
            currentLineSuffix: '',
            prevNonEmptyLine: '',
            nextNonEmptyLine: '',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: null,
            position: { character: 7, line: 0 },
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
            dynamicMultlilineCompletions: false,
        })
        const contextRange = getContextRange(document, docContext)

        expect(contextRange).toMatchInlineSnapshot(`
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

    it('detect the multiline trigger for python with `dynamicMultlilineCompletions` enabled', () => {
        const { document, position } = documentAndPosition('def greatest_common_divisor(a, b):█', 'python')

        const { multilineTrigger, multilineTriggerPosition } = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
            dynamicMultlilineCompletions: true,
        })

        expect(multilineTrigger).toBe(':')
        expect(multilineTriggerPosition).toEqual({ line: 0, character: 34 })
    })
})
