import dedent from 'dedent'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'
import type * as Parser from 'web-tree-sitter'

import { range } from '../testutils/textDocument'
import { asPoint } from '../tree-sitter/parse-tree-cache'
import { type WrappedParser, resetParsersCache } from '../tree-sitter/parser'

import type { DocumentContext } from '@sourcegraph/cody-shared'
import { getContextRange } from './doc-context-getters'
import {
    getCurrentDocContext,
    getPrefixWithCharLimit,
    getSuffixWithCharLimit,
    insertIntoDocContext,
} from './get-current-doc-context'
import { documentAndPosition, initTreeSitterParser } from './test-helpers'

function testGetCurrentDocContext(
    code: string,
    context?: vscode.InlineCompletionContext,
    maxPrefixLength = 100,
    maxSuffixLength = 100
) {
    const { document, position } = documentAndPosition(code)

    return getCurrentDocContext({
        document,
        position,
        maxPrefixLength,
        maxSuffixLength,
        context,
    })
}

describe('getCurrentDocContext', () => {
    it('returns `docContext` for a function block', () => {
        const result = testGetCurrentDocContext('function myFunction() {\n  █')

        expect(result).toEqual({
            completePrefix: 'function myFunction() {\n  ',
            completeSuffix: '',
            prefix: 'function myFunction() {\n  ',
            suffix: '',
            currentLinePrefix: '  ',
            currentLineSuffix: '',
            prevNonEmptyLine: 'function myFunction() {',
            nextNonEmptyLine: '',
            multilineTrigger: '{',
            multilineTriggerPosition: {
                character: 22,
                line: 0,
            },
            injectedPrefix: null,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
            position: { character: 2, line: 1 },
        })
    })

    it('returns `completePrefix` and `completeSuffix` correctly for large files', () => {
        const longPrefix = '// Some big prefix in the code\n'.repeat(100)
        const longSuffix = '// Some big suffix in the code\n'.repeat(100)
        const immediatePrefix = 'const value = 5;\nif('
        const immediateSuffix = '){\n    console.log(value)\n}\n'
        const code = `${longPrefix}${immediatePrefix}█${immediateSuffix}${longSuffix}`
        const result = testGetCurrentDocContext(
            code,
            undefined,
            immediatePrefix.length,
            immediateSuffix.length
        )

        expect(result).toEqual({
            completePrefix: `${longPrefix}${immediatePrefix}`,
            completeSuffix: `${immediateSuffix}${longSuffix}`,
            prefix: immediatePrefix,
            suffix: immediateSuffix.trimEnd().replace(/\n$/, ''),
            currentLinePrefix: 'if(',
            currentLineSuffix: '){',
            prevNonEmptyLine: 'const value = 5;',
            nextNonEmptyLine: '    console.log(value)',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: null,
            maxPrefixLength: immediatePrefix.length,
            maxSuffixLength: immediateSuffix.length,
            position: { character: 3, line: longPrefix.split('\n').length },
        })
    })

    it('returns `docContext` for an if block', () => {
        const result = testGetCurrentDocContext('const x = 1\nif (true) {\n  █\n}')

        expect(result).toEqual({
            completePrefix: 'const x = 1\nif (true) {\n  ',
            completeSuffix: '\n}',
            prefix: 'const x = 1\nif (true) {\n  ',
            suffix: '\n}',
            currentLinePrefix: '  ',
            currentLineSuffix: '',
            prevNonEmptyLine: 'if (true) {',
            nextNonEmptyLine: '}',
            multilineTrigger: '{',
            multilineTriggerPosition: {
                character: 10,
                line: 1,
            },
            injectedPrefix: null,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
            position: { character: 2, line: 2 },
        })
    })

    it('returns correct multi-line trigger', () => {
        const result = testGetCurrentDocContext('const arr = [█\n];')

        expect(result).toEqual({
            completePrefix: 'const arr = [',
            completeSuffix: '\n];',
            prefix: 'const arr = [',
            suffix: '\n];',
            currentLinePrefix: 'const arr = [',
            currentLineSuffix: '',
            prevNonEmptyLine: '',
            nextNonEmptyLine: '];',
            multilineTrigger: '[',
            multilineTriggerPosition: {
                character: 12,
                line: 0,
            },
            injectedPrefix: null,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
            position: { character: 13, line: 0 },
        })
    })

    it('removes \\r from the same current line suffix, prefix, and suffix', () => {
        const result = testGetCurrentDocContext('console.log(1337);\r\nconst arr = [█\r\n];')

        expect(result).toEqual({
            completePrefix: 'console.log(1337);\nconst arr = [',
            completeSuffix: '\n];',
            prefix: 'console.log(1337);\nconst arr = [',
            suffix: '\n];',
            currentLinePrefix: 'const arr = [',
            currentLineSuffix: '',
            prevNonEmptyLine: 'console.log(1337);',
            nextNonEmptyLine: '];',
            multilineTrigger: '[',
            multilineTriggerPosition: {
                character: 12,
                line: 1,
            },
            injectedPrefix: null,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
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
            completePrefix: 'console.assert',
            completeSuffix: '',
            prefix: 'console.assert',
            suffix: '',
            currentLinePrefix: 'console.assert',
            currentLineSuffix: '',
            prevNonEmptyLine: '',
            nextNonEmptyLine: '',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: 'ssert',
            maxPrefixLength: 100,
            maxSuffixLength: 100,
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
            completePrefix: '// some line before\nconsole.log',
            completeSuffix: '',
            prefix: '// some line before\nconsole.log',
            suffix: '',
            currentLinePrefix: 'console.log',
            currentLineSuffix: '',
            prevNonEmptyLine: '// some line before',
            nextNonEmptyLine: '',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: 'log',
            maxPrefixLength: 100,
            maxSuffixLength: 100,
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
            completePrefix: 'console',
            completeSuffix: '',
            currentLinePrefix: 'console',
            currentLineSuffix: '',
            prefix: 'console',
            suffix: '',
            prevNonEmptyLine: '',
            nextNonEmptyLine: '',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: null,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
            position: { character: 7, line: 0 },
        })
    })

    describe('multiline triggers', () => {
        let parser: WrappedParser

        interface PrepareTestParams {
            code: string
            languageId?: string
        }

        interface PrepareTestResult {
            docContext: DocumentContext
            tree: Parser.Tree
        }

        function prepareTest(params: PrepareTestParams): PrepareTestResult {
            const { code, languageId } = params
            const { document, position } = documentAndPosition(code, languageId)

            const tree = parser.parse(document.getText())
            const docContext = getCurrentDocContext({
                document,
                position,
                maxPrefixLength: 100,
                maxSuffixLength: 100,
            })

            return { tree, docContext }
        }

        beforeAll(async () => {
            const initializedParser = await initTreeSitterParser()
            if (initializedParser === undefined) {
                throw new Error('Could not initialize tree-sitter parser')
            }
            parser = initializedParser
        })

        afterAll(() => {
            resetParsersCache()
        })

        it.each([
            dedent`
                    def greatest_common_divisor(a, b):█
                `,
            dedent`
                    def greatest_common_divisor(a, b):
                        if a == 0:█
                `,
            dedent`
                    def bubbleSort(arr):
                        n = len(arr)
                        for i in range(n-1):
                            █
                `,
        ])('detects the multiline trigger for python', code => {
            const {
                tree,
                docContext: { multilineTrigger, multilineTriggerPosition },
            } = prepareTest({ code, languageId: 'python' })

            const triggerNode = tree.rootNode.descendantForPosition(asPoint(multilineTriggerPosition!))
            expect(multilineTrigger).toBe(triggerNode.text)
        })

        it.each([
            'const results = {█',
            'const result = {\n  █',
            'const result = {\n    █',
            'const something = true\nfunction bubbleSort(█)',
        ])('returns correct multiline trigger position', code => {
            const {
                tree,
                docContext: { multilineTrigger, multilineTriggerPosition },
            } = prepareTest({ code })

            const triggerNode = tree.rootNode.descendantForPosition(asPoint(multilineTriggerPosition!))
            expect(multilineTrigger).toBe(triggerNode.text)
        })

        it.each([
            dedent`
                    detectMultilineTrigger(
                        █
                    )
                `,
            dedent`
                    const oddNumbers = [
                        █
                    ]
                `,
            dedent`
                    type Whatever = {
                        █
                    }
                `,
        ])('detects the multiline trigger on the new line inside of parentheses', code => {
            const {
                tree,
                docContext: { multilineTrigger, multilineTriggerPosition },
            } = prepareTest({ code })

            const triggerNode = tree.rootNode.descendantForPosition(asPoint(multilineTriggerPosition!))
            expect(triggerNode.text).toBe(multilineTrigger)
        })

        it.each(['const oddNumbers = [█]', 'const result = {█}'])(
            'detects the multiline trigger on the current line inside of parentheses',
            code => {
                const {
                    tree,
                    docContext: { multilineTrigger, multilineTriggerPosition },
                } = prepareTest({ code })

                const triggerNode = tree.rootNode.descendantForPosition(
                    asPoint(multilineTriggerPosition!)
                )
                expect(triggerNode.text).toBe(multilineTrigger)
            }
        )
    })
})

describe('getContextRange', () => {
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
})

describe('insertCompletionIntoDocContext', () => {
    it('inserts the completion and updates document prefix/suffix and cursor position', () => {
        const { document, position } = documentAndPosition(
            dedent`
                function helloWorld() {
                    █
                }
            `
        )
        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 140,
            maxSuffixLength: 60,
        })

        const insertText = "console.log('hello')\n    console.log('world')"

        const updatedDocContext = insertIntoDocContext({
            docContext,
            insertText,
            languageId: document.languageId,
        })

        expect(updatedDocContext).toEqual({
            completePrefix: dedent`
                function helloWorld() {
                    console.log('hello')
                    console.log('world')`,
            completeSuffix: '\n}',
            prefix: dedent`
                function helloWorld() {
                    console.log('hello')
                    console.log('world')`,
            suffix: '\n}',
            currentLinePrefix: "    console.log('world')",
            currentLineSuffix: '',
            injectedCompletionText: insertText,
            prevNonEmptyLine: "    console.log('hello')",
            nextNonEmptyLine: '}',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: null,
            maxPrefixLength: 140,
            maxSuffixLength: 60,
            position: { character: 24, line: 2 },
            positionWithoutInjectedCompletionText: docContext.position,
        })
    })

    it('does not duplicate the insertion characters when an existing suffix is being replaced by the single-line completion', () => {
        const { document, position } = documentAndPosition(
            dedent`
                function helloWorld() {
                    console.log(█, 'world')
                }
            `
        )
        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 140,
            maxSuffixLength: 60,
        })

        const insertText = "'hello', 'world')"
        const updatedDocContext = insertIntoDocContext({
            docContext,
            insertText,
            languageId: document.languageId,
        })

        expect(updatedDocContext).toEqual({
            completePrefix: dedent`
                function helloWorld() {
                    console.log('hello', 'world')`,
            completeSuffix: '\n}',
            prefix: dedent`
                function helloWorld() {
                    console.log('hello', 'world')`,
            suffix: '\n}',
            currentLinePrefix: "    console.log('hello', 'world')",
            currentLineSuffix: '',
            injectedCompletionText: insertText,
            prevNonEmptyLine: 'function helloWorld() {',
            nextNonEmptyLine: '}',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: null,
            maxPrefixLength: 140,
            maxSuffixLength: 60,
            // Note: The position is always moved at the end of the line that the text was inserted
            position: { character: "    console.log('hello', 'world')".length, line: 1 },
            positionWithoutInjectedCompletionText: docContext.position,
        })
    })

    it('does not duplicate the insertion characters when an existing suffix is being replaced by the multi-line completion', () => {
        const { document, position } = documentAndPosition(
            dedent`
                function helloWorld() {
                    f(1, {█2)
                }
            `
        )
        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 140,
            maxSuffixLength: 60,
        })

        const insertText = '\n        propA: foo,\n        propB: bar,\n    }, 2)'
        const updatedDocContext = insertIntoDocContext({
            docContext,
            insertText,
            languageId: document.languageId,
        })

        expect(updatedDocContext).toEqual({
            completePrefix: dedent`
                function helloWorld() {
                    f(1, {
                        propA: foo,
                        propB: bar,
                    }, 2)
            `,
            completeSuffix: '\n}',
            prefix: dedent`
                function helloWorld() {
                    f(1, {
                        propA: foo,
                        propB: bar,
                    }, 2)
            `,
            suffix: '\n}',
            currentLinePrefix: '    }, 2)',
            currentLineSuffix: '',
            injectedCompletionText: insertText,
            prevNonEmptyLine: '        propB: bar,',
            nextNonEmptyLine: '}',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: null,
            maxPrefixLength: 140,
            maxSuffixLength: 60,
            // Note: The position is always moved at the end of the line that the text was inserted
            position: { character: '    }, 2)'.length, line: 4 },
            positionWithoutInjectedCompletionText: docContext.position,
        })
    })

    it('inserts the completion for the big document', () => {
        const repeatCount = 5
        const longPrefix = '// Some big prefix in the code\n'.repeat(repeatCount)
        const longSuffix = '\n// Some big suffix in the code'.repeat(repeatCount)
        const middleCode = dedent`
            function helloWorld() {
                █
            }
        `
        const code = `${longPrefix}${middleCode}${longSuffix}`
        const insertText = "console.log('hello')\n    console.log('world')"

        const { document, position } = documentAndPosition(code)
        const maxPrefixLength = insertText.length + middleCode.indexOf('█')
        const maxSuffixLength = middleCode.length - middleCode.indexOf('█')

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength,
            maxSuffixLength,
        })

        const updatedDocContext = insertIntoDocContext({
            docContext,
            insertText,
            languageId: document.languageId,
        })

        expect(updatedDocContext).toEqual({
            completePrefix: dedent`
                ${longPrefix}function helloWorld() {
                    console.log('hello')
                    console.log('world')`,
            completeSuffix: `\n}${longSuffix}`,
            prefix: dedent`
                function helloWorld() {
                    console.log('hello')
                    console.log('world')`,
            suffix: '\n}',
            currentLinePrefix: "    console.log('world')",
            currentLineSuffix: '',
            injectedCompletionText: insertText,
            prevNonEmptyLine: "    console.log('hello')",
            nextNonEmptyLine: '}',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: null,
            maxPrefixLength: maxPrefixLength,
            maxSuffixLength: maxSuffixLength,
            position: { character: 24, line: repeatCount + 2 },
            positionWithoutInjectedCompletionText: docContext.position,
        })
    })

    it('does not duplicate the insertion characters for single-line completion with long prefix and suffix', () => {
        const repeatCount = 5
        const longPrefix = '// Some big prefix in the code\n'.repeat(repeatCount)
        const longSuffix = '\n// Some big suffix in the code'.repeat(repeatCount)
        const middleCode = dedent`
            function helloWorld() {
                console.log(█, 'world')
            }
        `
        const code = `${longPrefix}${middleCode}${longSuffix}`
        const insertText = "'hello', 'world')"

        const maxPrefixLength = insertText.length + middleCode.indexOf('█')
        const maxSuffixLength = middleCode.length - middleCode.indexOf('█')

        const { document, position } = documentAndPosition(code)
        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength,
            maxSuffixLength,
        })

        const updatedDocContext = insertIntoDocContext({
            docContext,
            insertText,
            languageId: document.languageId,
        })

        expect(updatedDocContext).toEqual({
            completePrefix: dedent`
                ${longPrefix}function helloWorld() {
                    console.log('hello', 'world')`,
            completeSuffix: `\n}${longSuffix}`,
            prefix: dedent`
                function helloWorld() {
                    console.log('hello', 'world')`,
            suffix: '\n}',
            currentLinePrefix: "    console.log('hello', 'world')",
            currentLineSuffix: '',
            injectedCompletionText: insertText,
            prevNonEmptyLine: 'function helloWorld() {',
            nextNonEmptyLine: '}',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: null,
            maxPrefixLength: maxPrefixLength,
            maxSuffixLength: maxSuffixLength,
            // Note: The position is always moved at the end of the line that the text was inserted
            position: { character: "    console.log('hello', 'world')".length, line: repeatCount + 1 },
            positionWithoutInjectedCompletionText: docContext.position,
        })
    })

    it('does not duplicate the insertion characters for multi-line completion with long prefix and suffix', () => {
        const repeatCount = 5
        const longPrefix = '// Some big prefix in the code\n'.repeat(repeatCount)
        const longSuffix = '\n// Some big suffix in the code'.repeat(repeatCount)
        const middleCode = dedent`
            function helloWorld() {
                f(1, {█2)
            }
        `
        const code = `${longPrefix}${middleCode}${longSuffix}`
        const insertText = '\n        propA: foo,\n        propB: bar,\n    }, 2)'

        const maxPrefixLength = insertText.length + middleCode.indexOf('█')
        const maxSuffixLength = middleCode.length - middleCode.indexOf('█')

        const { document, position } = documentAndPosition(code)
        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength,
            maxSuffixLength,
        })

        const updatedDocContext = insertIntoDocContext({
            docContext,
            insertText,
            languageId: document.languageId,
        })

        expect(updatedDocContext).toEqual({
            completePrefix: dedent`
                ${longPrefix}function helloWorld() {
                    f(1, {
                        propA: foo,
                        propB: bar,
                    }, 2)
            `,
            completeSuffix: `\n}${longSuffix}`,
            prefix: dedent`
                function helloWorld() {
                    f(1, {
                        propA: foo,
                        propB: bar,
                    }, 2)
            `,
            suffix: '\n}',
            currentLinePrefix: '    }, 2)',
            currentLineSuffix: '',
            injectedCompletionText: insertText,
            prevNonEmptyLine: '        propB: bar,',
            nextNonEmptyLine: '}',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: null,
            maxPrefixLength: maxPrefixLength,
            maxSuffixLength: maxSuffixLength,
            // Note: The position is always moved at the end of the line that the text was inserted
            position: { character: '    }, 2)'.length, line: repeatCount + 4 },
            positionWithoutInjectedCompletionText: docContext.position,
        })
    })
})

describe('getPrefixWithCharLimit', () => {
    it('returns all lines when total length is within limit', () => {
        const prefixLines = ['line1', 'line2', 'line3']
        const result = getPrefixWithCharLimit(prefixLines, 100)
        expect(result).toBe('line1\nline2\nline3')
    })

    it('returns subset of lines from the end when total length exceeds limit', () => {
        const prefixLines = ['line1', 'line2', 'very_long_line3']
        const result = getPrefixWithCharLimit(prefixLines, 20)
        expect(result).toBe('line2\nvery_long_line3')
    })

    it('returns only last line when limit is small', () => {
        const prefixLines = ['line1', 'line2', 'line3']
        const result = getPrefixWithCharLimit(prefixLines, 5)
        expect(result).toBe('line3')
    })

    it('handles empty array', () => {
        const result = getPrefixWithCharLimit([], 100)
        expect(result).toBe('')
    })
})

describe('getSuffixWithCharLimit', () => {
    it('returns all lines when total length is within limit', () => {
        const suffixLines = ['line1', 'line2', 'line3']
        const result = getSuffixWithCharLimit(suffixLines, 100)
        expect(result).toBe('line1\nline2\nline3')
    })

    it('returns subset of lines from the start when total length exceeds limit', () => {
        const suffixLines = ['very_long_line1', 'line2', 'line3']
        const result = getSuffixWithCharLimit(suffixLines, 20)
        expect(result).toBe('very_long_line1\nline2')
    })

    it('returns only first line when limit is small', () => {
        const suffixLines = ['line1', 'line2', 'line3']
        const result = getSuffixWithCharLimit(suffixLines, 5)
        expect(result).toBe('line1')
    })

    it('handles empty array', () => {
        const result = getSuffixWithCharLimit([], 100)
        expect(result).toBe('')
    })
})
