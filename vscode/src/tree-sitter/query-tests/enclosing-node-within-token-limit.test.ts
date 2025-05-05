import { describe, expect, it } from 'vitest'

import { getEnclosingNodeWithinTokenLimit } from '../query-sdk'
import { initTreeSitterSDK } from '../test-helpers'
import { SupportedLanguage } from '../grammars'
import { documentAndPosition } from '../../completions/test-helpers'
import { parseDocument } from '../parse-tree-cache'

describe('getEnclosingNodeWithinTokenLimit', () => {
    it('should return a range that encompasses the enclosing node within character limit', async () => {
        await initTreeSitterSDK(SupportedLanguage.typescript)

        const { document, position } = documentAndPosition(`
function test() {
    const x = 1;
    const y = █2;
    return x + y;
}
        `.trim())

        await parseDocument(document)

        const smallRange = getEnclosingNodeWithinTokenLimit(document, position, 20)
        const smallText = document.getText(smallRange)

        expect(smallText).toMatchInlineSnapshot(`"const y = 2;"`)
        expect(smallText.length).toBeLessThanOrEqual(20)

        const mediumRange = getEnclosingNodeWithinTokenLimit(document, position, 80)
        const mediumText = document.getText(mediumRange)

        // Direct comparison with snapshot
        expect(mediumText).toMatchInlineSnapshot(`
          "function test() {
              const x = 1;
              const y = 2;
              return x + y;
          }"
        `)
        expect(mediumText.length).toBeLessThanOrEqual(80)

        const largeRange = getEnclosingNodeWithinTokenLimit(document, position, 200)
        const largeText = document.getText(largeRange)

        // Direct comparison with snapshot
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

        const { document, position } = documentAndPosition(`const x = '█This is a very long string that exceeds most reasonable character limits';`)

        // Force parse the document to ensure tree is in cache
        await parseDocument(document)

        // Very small character limit that's unlikely to fit any node
        const range = getEnclosingNodeWithinTokenLimit(document, position, 1)

        // Use toMatchInlineSnapshot for direct comparison
        expect(range).toMatchInlineSnapshot(`
          Range {
            "end": Position {
              "character": 11,
              "line": 0,
            },
            "start": Position {
              "character": 11,
              "line": 0,
            },
          }
        `)

        // Verify the range is at the cursor position
        expect(range.start.line).toBe(position.line)
        expect(range.start.character).toBe(position.character)
        expect(range.end.line).toBe(position.line)
        expect(range.end.character).toBe(position.character)
    })

    it('should handle different languages', async () => {
        await initTreeSitterSDK(SupportedLanguage.python)

        const { document, position } = documentAndPosition(
            `
def test_function():
    x = 1
    y = █2
    return x + y
        `.trim(),
            'python'
        )

        // Force parse the document to ensure tree is in cache
        await parseDocument(document)

        // Test with different character limits
        const smallRange = getEnclosingNodeWithinTokenLimit(document, position, 10)
        const smallText = document.getText(smallRange)

        // Direct comparison with snapshot
        expect(smallText).toMatchInlineSnapshot(`"y = 2"`)
        expect(smallText.length).toBeLessThanOrEqual(10)

        const mediumRange = getEnclosingNodeWithinTokenLimit(document, position, 50)
        const mediumText = document.getText(mediumRange)

        // Direct comparison with snapshot
        expect(mediumText).toMatchInlineSnapshot(`
          "x = 1
              y = 2
              return x + y"
        `)
        expect(mediumText.length).toBeLessThanOrEqual(50)

        // Verify medium range is larger than small range
        expect(mediumText.length).toBeGreaterThanOrEqual(smallText.length)

        // Large character limit (200) should return an even larger node
        const largeRange = getEnclosingNodeWithinTokenLimit(document, position, 200)
        const largeText = document.getText(largeRange)

        // Direct comparison with snapshot
        expect(largeText).toMatchInlineSnapshot(`
          "def test_function():
              x = 1
              y = 2
              return x + y"
        `)
        expect(largeText.length).toBeLessThanOrEqual(200)

        // Verify large range is larger than medium range
        expect(largeText.length).toBeGreaterThanOrEqual(mediumText.length)
    })
})
