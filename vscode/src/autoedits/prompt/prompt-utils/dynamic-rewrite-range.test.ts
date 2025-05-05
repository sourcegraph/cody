import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { documentAndPosition } from '../../../completions/test-helpers'
import { SupportedLanguage } from '../../../tree-sitter/grammars'
import { parseDocument } from '../../../tree-sitter/parse-tree-cache'
import { initTreeSitterSDK } from '../../../tree-sitter/test-helpers'
import { getEnclosingNodeWithinCharLimit } from './dynamic-rewrite-range'

describe('getEnclosingNodeWithinCharLimit', () => {
    it('should return a range that encompasses the enclosing node within character limit', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        const { document, position } = documentAndPosition(dedent`
            function test() {
                const x = 1;
                const y = █2;
                return x + y;
            }
        `)

        await parseDocument(document)

        const smallRange = getEnclosingNodeWithinCharLimit(document, position, 20)
        const smallText = document.getText(smallRange)

        expect(smallText).toMatchInlineSnapshot(`"const y = 2;"`)
        expect(smallText.length).toBeLessThanOrEqual(20)

        const mediumRange = getEnclosingNodeWithinCharLimit(document, position, 80)
        const mediumText = document.getText(mediumRange)

        expect(mediumText).toMatchInlineSnapshot(`
          "function test() {
              const x = 1;
              const y = 2;
              return x + y;
          }"
        `)
        expect(mediumText.length).toBeLessThanOrEqual(80)

        const largeRange = getEnclosingNodeWithinCharLimit(document, position, 200)
        const largeText = document.getText(largeRange)

        expect(largeText).toMatchInlineSnapshot(`
          "function test() {
              const x = 1;
              const y = 2;
              return x + y;
          }"
        `)
        expect(largeText.length).toBeLessThanOrEqual(200)
    })

    it('should handle edge cases where no suitable node is found', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        const { document, position } = documentAndPosition(
            `const x = '█This is a very long string that exceeds most reasonable character limits';`
        )

        await parseDocument(document)

        const range = getEnclosingNodeWithinCharLimit(document, position, 1)

        expect(range.start.line).toBe(position.line)
        expect(range.start.character).toBe(position.character)
        expect(range.end.line).toBe(position.line)
        expect(range.end.character).toBe(position.character)
    })

    it('should handle different languages', async () => {
        await initTreeSitterSDK(SupportedLanguage.python)

        const { document, position } = documentAndPosition(
            dedent`
            def test_function():
                x = 1
                y = █2
                return x + y
        `,
            'python'
        )

        await parseDocument(document)

        const smallRange = getEnclosingNodeWithinCharLimit(document, position, 10)
        const smallText = document.getText(smallRange)

        expect(smallText).toMatchInlineSnapshot(`"y = 2"`)
        expect(smallText.length).toBeLessThanOrEqual(10)

        const mediumRange = getEnclosingNodeWithinCharLimit(document, position, 50)
        const mediumText = document.getText(mediumRange)

        expect(mediumText).toMatchInlineSnapshot(`
          "x = 1
              y = 2
              return x + y"
        `)
        expect(mediumText.length).toBeLessThanOrEqual(50)

        expect(mediumText.length).toBeGreaterThanOrEqual(smallText.length)

        const largeRange = getEnclosingNodeWithinCharLimit(document, position, 200)
        const largeText = document.getText(largeRange)

        expect(largeText).toMatchInlineSnapshot(`
          "def test_function():
              x = 1
              y = 2
              return x + y"
        `)
        expect(largeText.length).toBeLessThanOrEqual(200)

        expect(largeText.length).toBeGreaterThanOrEqual(mediumText.length)
    })

    it('should handle root nodes and not get stuck in an infinite loop', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        const { document, position } = documentAndPosition('const x = █1;')

        await parseDocument(document)

        const range = getEnclosingNodeWithinCharLimit(document, position, 100)
        const text = document.getText(range)

        expect(text).toBe('const x = 1;')

        expect(range.start.character).toBe(0)
        expect(range.end.character).toBe(document.getText().length)
    })

    it('should handle broken code but still return a valid range', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        const { document, position } = documentAndPosition(
            dedent`
            function broken( {
                const x = █1;
                return x
            }
        `
        )

        await parseDocument(document)

        const range = getEnclosingNodeWithinCharLimit(document, position, 20)
        const text = document.getText(range)

        expect(text.includes('const x = 1') || text.includes('1')).toBe(true)
        expect(text.length).toBeLessThanOrEqual(20)
    })

    it('should handle empty files', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        const { document, position } = documentAndPosition('█')

        await parseDocument(document)

        const range = getEnclosingNodeWithinCharLimit(document, position, 100)

        expect(range.start.line).toBe(position.line)
        expect(range.start.character).toBe(position.character)
        expect(range.end.line).toBe(position.line)
        expect(range.end.character).toBe(position.character)
    })

    it('should handle cursor at beginning of file', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        const { document, position } = documentAndPosition('█const x = 1;')

        await parseDocument(document)

        const range = getEnclosingNodeWithinCharLimit(document, position, 100)
        const text = document.getText(range)

        expect(text).toBe('const x = 1;')
    })

    it('should handle cursor at end of file', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        const { document, position } = documentAndPosition('const x = 1;█')

        await parseDocument(document)

        const range = getEnclosingNodeWithinCharLimit(document, position, 100)
        const text = document.getText(range)

        expect(text.includes('const x = 1')).toBe(true)
    })

    it('should handle cursor in comments', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        const { document, position } = documentAndPosition(dedent`
            function test() {
                // This is a █comment
                const x = 1;
                return x;
            }
        `)

        await parseDocument(document)

        const range = getEnclosingNodeWithinCharLimit(document, position, 30)
        const text = document.getText(range)

        expect(text.includes('comment')).toBe(true)
        expect(text.length).toBeLessThanOrEqual(30)
    })

    it('should handle very large ranges beyond limit', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        let largeContent = 'function largeFunction() {\n'
        for (let i = 0; i < 100; i++) {
            largeContent += `    const var${i} = ${i};\n`
        }
        largeContent += '    const important = █1;\n'
        for (let i = 0; i < 100; i++) {
            largeContent += `    const more${i} = ${i};\n`
        }
        largeContent += '}'

        const { document, position } = documentAndPosition(largeContent)

        await parseDocument(document)

        const smallRange = getEnclosingNodeWithinCharLimit(document, position, 30)
        const smallText = document.getText(smallRange)

        expect(smallText.includes('const important')).toBe(true)
        expect(smallText.length).toBeLessThanOrEqual(30)

        const mediumRange = getEnclosingNodeWithinCharLimit(document, position, 200)
        const mediumText = document.getText(mediumRange)

        expect(mediumText.length).toBeGreaterThanOrEqual(smallText.length)
        expect(mediumText.length).toBeLessThanOrEqual(200)
    })
})
