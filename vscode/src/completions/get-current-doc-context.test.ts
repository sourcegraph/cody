import dedent from 'dedent'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import * as Parser from 'web-tree-sitter'

import { range } from '../testutils/textDocument'
import { asPoint } from '../tree-sitter/parse-tree-cache'
import { resetParsersCache } from '../tree-sitter/parser'

import { getContextRange } from './doc-context-getters'
import { DocumentContext, getCurrentDocContext, insertIntoDocContext } from './get-current-doc-context'
import { documentAndPosition, initTreeSitterParser } from './test-helpers'

function testGetCurrentDocContext(code: string, context?: vscode.InlineCompletionContext) {
    const { document, position } = documentAndPosition(code)

    return getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 100,
        maxSuffixLength: 100,
        context,
        dynamicMultilineCompletions: false,
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
                character: 22,
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
                character: 10,
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
                character: 12,
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
                character: 12,
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
            dynamicMultilineCompletions: false,
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

    describe('multiline triggers', () => {
        let parser: Parser

        interface PrepareTestParams {
            code: string
            dynamicMultilineCompletions: boolean
            langaugeId?: string
        }

        interface PrepareTestResult {
            docContext: DocumentContext
            tree: Parser.Tree
        }

        function prepareTest(params: PrepareTestParams): PrepareTestResult {
            const { dynamicMultilineCompletions, code, langaugeId } = params
            const { document, position } = documentAndPosition(code, langaugeId)

            const tree = parser.parse(document.getText())
            const docContext = getCurrentDocContext({
                document,
                position,
                maxPrefixLength: 100,
                maxSuffixLength: 100,
                dynamicMultilineCompletions,
            })

            return { tree, docContext }
        }

        beforeAll(async () => {
            parser = await initTreeSitterParser()
        })

        afterAll(() => {
            resetParsersCache()
        })

        describe('with enabled dynamicMultilineCompletions', () => {
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
                } = prepareTest({ code, dynamicMultilineCompletions: true, langaugeId: 'python' })

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
                } = prepareTest({ code, dynamicMultilineCompletions: true })

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
                } = prepareTest({ code, dynamicMultilineCompletions: true })

                const triggerNode = tree.rootNode.descendantForPosition(asPoint(multilineTriggerPosition!))
                expect(triggerNode.text).toBe(multilineTrigger)
            })
        })

        describe('with disabled dynamicMultilineCompletions', () => {
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
            ])('does not detect the multiline trigger on the new line inside of parentheses', code => {
                const { multilineTrigger } = prepareTest({ code, dynamicMultilineCompletions: false }).docContext
                expect(multilineTrigger).toBeNull()
            })

            it.each(['detectMultilineTrigger(█)', 'const oddNumbers = [█]', 'const result = {█}'])(
                'detects the multiline trigger on the current line inside of parentheses',
                code => {
                    const {
                        tree,
                        docContext: { multilineTrigger, multilineTriggerPosition },
                    } = prepareTest({ code, dynamicMultilineCompletions: true })

                    const triggerNode = tree.rootNode.descendantForPosition(asPoint(multilineTriggerPosition!))
                    expect(triggerNode.text).toBe(multilineTrigger)
                }
            )
        })
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
            dynamicMultilineCompletions: false,
        })

        const updatedDocContext = insertIntoDocContext(
            docContext,
            "console.log('hello')\n    console.log('world')",
            document.languageId
        )

        expect(updatedDocContext).toEqual({
            prefix: dedent`
                function helloWorld() {
                    console.log('hello')
                    console.log('world')`,
            suffix: '\n}',
            currentLinePrefix: "    console.log('world')",
            currentLineSuffix: '',
            prevNonEmptyLine: "    console.log('hello')",
            nextNonEmptyLine: '}',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: null,
            position: { character: 24, line: 2 },
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
            dynamicMultilineCompletions: false,
        })

        const updatedDocContext = insertIntoDocContext(docContext, "'hello', 'world')", document.languageId)

        expect(updatedDocContext).toEqual({
            prefix: dedent`
                function helloWorld() {
                    console.log('hello', 'world')`,
            suffix: '\n}',
            currentLinePrefix: "    console.log('hello', 'world')",
            currentLineSuffix: '',
            prevNonEmptyLine: 'function helloWorld() {',
            nextNonEmptyLine: '}',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: null,
            // Note: The position is always moved at the end of the line that the text was inserted
            position: { character: "    console.log('hello', 'world')".length, line: 1 },
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
            dynamicMultilineCompletions: false,
        })

        const updatedDocContext = insertIntoDocContext(
            docContext,
            '\n        propA: foo,\n        propB: bar,\n    }, 2)',
            document.languageId
        )

        expect(updatedDocContext).toEqual({
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
            prevNonEmptyLine: '        propB: bar,',
            nextNonEmptyLine: '}',
            multilineTrigger: null,
            multilineTriggerPosition: null,
            injectedPrefix: null,
            // Note: The position is always moved at the end of the line that the text was inserted
            position: { character: '    }, 2)'.length, line: 4 },
        })
    })
})
