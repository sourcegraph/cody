import { describe, expect, it } from 'vitest'

import { getCurrentDocContext } from './get-current-doc-context'
import { documentAndPosition } from './testHelpers'

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
            currentLinePrefix: 'const arr = [',
            currentLineSuffix: '',
            prevNonEmptyLine: '',
            nextNonEmptyLine: '];',
            multilineTrigger: '[',
        })
    })
})
