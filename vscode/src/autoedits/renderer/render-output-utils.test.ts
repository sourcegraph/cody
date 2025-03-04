import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { getCompletionText } from './render-output-utils'

import { documentAndPosition } from '../../completions/test-helpers'
import { getDecorationInfo } from './diff-utils'

function getCompletionTextFromStrings(currentFileText: string, predictedFileText: string) {
    const { position } = documentAndPosition(currentFileText)
    const decorationInfo = getDecorationInfo(currentFileText.replace('█', ''), predictedFileText)

    const { insertText } = getCompletionText({
        prediction: predictedFileText,
        cursorPosition: position,
        decorationInfo,
    })

    return insertText
}

describe('getCompletionText', () => {
    it('includes inserted text after the cursor on the same line', () => {
        const currentFileText = 'const a = █'
        const predictedFileText = 'const a = 1;'

        const completionText = getCompletionTextFromStrings(currentFileText, predictedFileText)
        expect(completionText).toBe('1;')
    })

    it('includes added lines following cursor position', () => {
        const currentFileText = 'const a = 1;█'
        const predictedFileText = 'const a = 1;\nconst b = 2;'

        const completionText = getCompletionTextFromStrings(currentFileText, predictedFileText)
        expect(completionText).toBe('\nconst b = 2;')
    })

    it('includes inserted text in modified line after cursor position', () => {
        const currentFileText = 'console.log("Hello, █");'
        const predictedFileText = 'console.log("Hello, world!");'

        const completionText = getCompletionTextFromStrings(currentFileText, predictedFileText)
        expect(completionText).toBe('world!");')
    })

    it('includes added lines inside function body after cursor', () => {
        const currentFileText = 'function test() {█\n}'
        const predictedFileText = 'function test() {\n  console.log("hello");\n}'

        const completionText = getCompletionTextFromStrings(currentFileText, predictedFileText)
        expect(completionText).toBe('\n  console.log("hello");')
    })

    it('excludes deleted lines from completion text', () => {
        const currentFileText = 'const a = 1;\nconst b = 2;const c = 3;█'
        const predictedFileText = 'const a = 1;\nconst c = 3;'

        const completionText = getCompletionTextFromStrings(currentFileText, predictedFileText)
        expect(completionText).toBe('')
    })

    it('handles empty prediction', () => {
        const currentFileText = '█'
        const predictedFileText = ''

        const completionText = getCompletionTextFromStrings(currentFileText, predictedFileText)
        expect(completionText).toBe('')
    })

    it('handles mixed insertions, deletions and new line additions', () => {
        const currentFileText = 'top 10█px left 10px fixed'
        const predictedFileText = "top: '10px',\n left: '10px',\n position: 'fixed',"

        const completionText = getCompletionTextFromStrings(currentFileText, predictedFileText)
        expect(completionText).toBe("px left: '10px fixed',\n left: '10px',\n position: 'fixed',")
    })

    it('handles multi-line insertion after cursor position', () => {
        const currentFileText = 'function test() {█\n}'
        const predictedFileText = 'function test() {\n  const a = 1;\n  const b = 2;\n}'

        const completionText = getCompletionTextFromStrings(currentFileText, predictedFileText)
        expect(completionText).toBe('\n  const a = 1;\n  const b = 2;')
    })

    it('handles modified lines with only insertions on empty lines after cursor', () => {
        const currentFileText = 'line1█\nline3'
        const predictedFileText = 'line1\nline2\nline3'

        const completionText = getCompletionTextFromStrings(currentFileText, predictedFileText)
        expect(completionText).toBe('\nline2')
    })

    it('handles disjoint new lines after the cursor', () => {
        const currentFileText = 'function test() {█\n}'
        const predictedFileText = 'function test() {\n  const a = 1;\n\n  const b = 2;\n}'

        const completionText = getCompletionTextFromStrings(currentFileText, predictedFileText)
        expect(completionText).toBe('\n  const a = 1;\n\n  const b = 2;')
    })

    it('uses correct line numbers for `insertText` extraction', () => {
        const currentFileText = dedent`
            function addCoupleToGroups(personOne: Person, personTwo: Person, groups: Group[]): Group[] {
                console.log('Adding couple to groups', personOne, personTwo)
                for (const group █of groups) {
                    group.members.push(personOne, personTwo)
                }
                return groups
            }
        `

        // Because the console.log statement is deleted, `getCompletionText` will start the insert text
        // extraction from the current line. This test ensures that it uses the original line number,
        // which is not affected by the deletion.
        const predictedFileText = dedent`
            function addCoupleToGroups(personOne: Person, personTwo: Person, groups: Group[]): Group[] {
                for (const group of groups) {
                    group.members.push(coupleA, coupleB)
                    console.log('Added couple to group', group.name)
                }
                return groups
            }
        `
        const completionText = getCompletionTextFromStrings(currentFileText, predictedFileText)
        expect(completionText).toBe('')
    })
})
