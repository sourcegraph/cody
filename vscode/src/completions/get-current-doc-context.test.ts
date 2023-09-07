import { describe, expect, it } from 'vitest'

import { getCurrentDocContext } from './get-current-doc-context'
import { documentAndPosition } from './testHelpers'

describe('getCurrentDocContext', () => {
    it('returns `docContext` for a function block', () => {
        const { document, position } = documentAndPosition('function myFunction() {\n  █')

        const result = getCurrentDocContext(document, position, 100, 100, true)

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
        const { document, position } = documentAndPosition('const x = 1\nif (true) {\n  █\n}')

        const result = getCurrentDocContext(document, position, 100, 100, true)

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
        const { document, position } = documentAndPosition('const arr = [█\n];')

        const result = getCurrentDocContext(document, position, 100, 100, true)

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
