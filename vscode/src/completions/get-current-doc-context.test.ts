import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { getCurrentDocContext } from './get-current-doc-context'
import { documentAndPosition } from './test-helpers'

function testGetCurrentDocContext(code: string) {
    const { document, position } = documentAndPosition(code)

    return getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 100,
        maxSuffixLength: 100,
        enableExtendedTriggers: true,
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
