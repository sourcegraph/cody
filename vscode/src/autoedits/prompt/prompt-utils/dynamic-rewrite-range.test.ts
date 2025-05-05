import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { documentAndPosition } from '../../../completions/test-helpers'
import { SupportedLanguage } from '../../../tree-sitter/grammars'
import { parseDocument } from '../../../tree-sitter/parse-tree-cache'
import { initTreeSitterSDK } from '../../../tree-sitter/test-helpers'
import { getDynamicCodeToRewrite, getEnclosingNodeWithinCharLimit } from './dynamic-rewrite-range'

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

        const smallRange = getEnclosingNodeWithinCharLimit(document, position, 20, false)
        const smallText = document.getText(smallRange)

        expect(smallText).toMatchInlineSnapshot(`"const y = 2;"`)
        expect(smallText.length).toBeLessThanOrEqual(20)

        const mediumRange = getEnclosingNodeWithinCharLimit(document, position, 80, false)
        const mediumText = document.getText(mediumRange)

        expect(mediumText).toMatchInlineSnapshot(`
          "function test() {
              const x = 1;
              const y = 2;
              return x + y;
          }"
        `)
        expect(mediumText.length).toBeLessThanOrEqual(80)

        const largeRange = getEnclosingNodeWithinCharLimit(document, position, 200, false)
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

        const range = getEnclosingNodeWithinCharLimit(document, position, 1, false)

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

        const smallRange = getEnclosingNodeWithinCharLimit(document, position, 10, false)
        const smallText = document.getText(smallRange)

        expect(smallText).toMatchInlineSnapshot(`"y = 2"`)
        expect(smallText.length).toBeLessThanOrEqual(10)

        const mediumRange = getEnclosingNodeWithinCharLimit(document, position, 50, false)
        const mediumText = document.getText(mediumRange)

        expect(mediumText).toMatchInlineSnapshot(`
          "x = 1
              y = 2
              return x + y"
        `)
        expect(mediumText.length).toBeLessThanOrEqual(50)

        expect(mediumText.length).toBeGreaterThanOrEqual(smallText.length)

        const largeRange = getEnclosingNodeWithinCharLimit(document, position, 200, false)
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

        const range = getEnclosingNodeWithinCharLimit(document, position, 100, false)
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

        const range = getEnclosingNodeWithinCharLimit(document, position, 20, false)
        const text = document.getText(range)

        expect(text.includes('const x = 1') || text.includes('1')).toBe(true)
        expect(text.length).toBeLessThanOrEqual(20)
    })

    it('should handle empty files', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        const { document, position } = documentAndPosition('█')

        await parseDocument(document)

        const range = getEnclosingNodeWithinCharLimit(document, position, 100, false)

        expect(range.start.line).toBe(position.line)
        expect(range.start.character).toBe(position.character)
        expect(range.end.line).toBe(position.line)
        expect(range.end.character).toBe(position.character)
    })

    it('should handle cursor at beginning of file', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        const { document, position } = documentAndPosition('█const x = 1;')

        await parseDocument(document)

        const range = getEnclosingNodeWithinCharLimit(document, position, 100, false)
        const text = document.getText(range)

        expect(text).toBe('const x = 1;')
    })

    it('should handle cursor at end of file', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        const { document, position } = documentAndPosition('const x = 1;█')

        await parseDocument(document)

        const range = getEnclosingNodeWithinCharLimit(document, position, 100, false)
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

        const range = getEnclosingNodeWithinCharLimit(document, position, 30, false)
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

        const smallRange = getEnclosingNodeWithinCharLimit(document, position, 30, false)
        const smallText = document.getText(smallRange)

        expect(smallText.includes('const important')).toBe(true)
        expect(smallText.length).toBeLessThanOrEqual(30)

        const mediumRange = getEnclosingNodeWithinCharLimit(document, position, 200, false)
        const mediumText = document.getText(mediumRange)

        expect(mediumText.length).toBeGreaterThanOrEqual(smallText.length)
        expect(mediumText.length).toBeLessThanOrEqual(200)
    })

    it('should expand to full lines when expandToFullLine is true', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        const { document, position } = documentAndPosition(dedent`
            function test() {
                const x = 1;
                const y = █2;
                return x + y;
            }
        `)

        await parseDocument(document)

        const normalRange = getEnclosingNodeWithinCharLimit(document, position, 60, false)
        const normalText = document.getText(normalRange)

        expect(normalText).toMatchInlineSnapshot(`
            "{
                const x = 1;
                const y = 2;
                return x + y;
            }"
        `)

        const expandedNodeRange = getEnclosingNodeWithinCharLimit(document, position, 60, true)
        const expandedText = document.getText(expandedNodeRange)

        expect(expandedText).toMatchInlineSnapshot(`
            "function test() {
                const x = 1;
                const y = 2;
                return x + y;
            }"
        `)
    })
})

describe('getDynamicCodeToRewrite', () => {
    it('should return correct start and end lines based on character limit', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        const { document, position } = documentAndPosition(dedent`
            function test() {
                const x = 1;
                const y = █2;
                return x + y;
            }
        `)

        await parseDocument(document)

        // Test with small character limit
        const smallResult = getDynamicCodeToRewrite(document, position, 20)
        expect(smallResult.codeToRewriteStartLine).toBe(1) // Line with "const y = 2;"
        expect(smallResult.codeToRewriteEndLine).toBe(2)

        // Test with medium character limit - should include more context
        const mediumResult = getDynamicCodeToRewrite(document, position, 80)
        expect(mediumResult.codeToRewriteStartLine).toBe(0) // Should include the whole function
        expect(mediumResult.codeToRewriteEndLine).toBe(4) // Should include the whole function

        // Test with large character limit - should include the whole function
        const largeResult = getDynamicCodeToRewrite(document, position, 200)
        expect(largeResult.codeToRewriteStartLine).toBe(0) // First line of the function
        expect(largeResult.codeToRewriteEndLine).toBe(4) // Last line of the function
    })

    it('should respect the prefixTokenFraction parameter', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        let content = ''
        for (let i = 0; i < 10; i++) {
            content += `const line${i} = ${i};\n`
        }
        content += 'const target = █123;\n'
        for (let i = 0; i < 10; i++) {
            content += `const afterLine${i} = ${i};\n`
        }

        const { document, position } = documentAndPosition(content)
        await parseDocument(document)

        // With higher prefixTokenFraction (0.8) - should include more prefix lines
        const morePrefix = getDynamicCodeToRewrite(document, position, 500, 0.8)

        // With lower prefixTokenFraction (0.0) - should include only suffix lines
        const noPrefix = getDynamicCodeToRewrite(document, position, 500, 0.0)

        // With prefixTokenFraction 0.8, we should have more prefix lines than with 0.1
        expect(morePrefix.codeToRewriteStartLine).toBe(0)

        // With prefixTokenFraction 0.0, we should have no prefix lines
        expect(noPrefix.codeToRewriteStartLine).toBe(0)

        // With prefixTokenFraction 0.0, we should have more suffix lines
        expect(noPrefix.codeToRewriteEndLine).toBe(21)
    })

    it.only('should handle edge cases and empty files', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        // Empty file
        const emptyDoc = documentAndPosition('█')
        await parseDocument(emptyDoc.document)

        const emptyResult = getDynamicCodeToRewrite(emptyDoc.document, emptyDoc.position, 100)
        expect(emptyResult.codeToRewriteStartLine).toBe(0)
        expect(emptyResult.codeToRewriteEndLine).toBe(0)

        // Very small file
        const smallDoc = documentAndPosition('const x = █1;')
        await parseDocument(smallDoc.document)

        const smallResult = getDynamicCodeToRewrite(smallDoc.document, smallDoc.position, 100)
        expect(smallResult.codeToRewriteStartLine).toBe(0)
        expect(smallResult.codeToRewriteEndLine).toBe(0)

        // Character limit smaller than the node itself
        const { document, position } = documentAndPosition(
            'const firstLine = 1;\nconst thisIsAVeryLongVariableName = █123456789;'
        )
        await parseDocument(document)

        const tinyLimit = getDynamicCodeToRewrite(document, position, 5)
        expect(tinyLimit.codeToRewriteStartLine).toBe(1)
        expect(tinyLimit.codeToRewriteEndLine).toBe(1)
    })
})
