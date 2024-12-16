import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { getCurrentDocContext } from '../completions/get-current-doc-context'
import { documentAndPosition } from '../completions/test-helpers'

import { type CodeToReplaceData, getCurrentFilePromptComponents } from './prompt-utils'
import { shrinkPredictionUntilSuffix } from './shrink-prediction'

describe('shrinkPredictionUntilSuffix', () => {
    it('middle of file, no overlap, 4-line prediction', () => {
        const codeToReplaceData = createCodeToReplaceData`const a = 1
            const b = 2
            const c = 3
            console.log(a, b, c)█
            function greet() { console.log("Hello") }
            const x = 10
            console.log(x)
            console.log("end")
        `

        const prediction = dedent`const c = 999
            console.log(a + b, c)
            let y = 42
            function greet() { console.log("Changed!") }
        `

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        expect(result.trimEnd()).toBe(prediction)
    })

    it('middle of file, partial overlap, 4-line prediction', () => {
        const codeToReplaceData = createCodeToReplaceData`const a = 1
            const b = 2
            const c = 3
            console.log(a, b, c)█
            function greet() { console.log("Hello") }
            console.log(a)
            console.log("end")
        `

        // 4-line prediction. The last line "console.log(a)" is a suffix line and should be overlapped and removed.
        const prediction = dedent`const c = 999
            console.log(a * b * c)
            function greet() { console.log("Modified hello") }
            console.log(a)
        `

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)

        // After removing overlap (console.log(a)), we have 3 lines left.
        // This matches the original codeToReplace line count (3 lines).
        expect(result.trimEnd()).toBe(withoutLastLines(prediction, 1))
    })

    it('middle of file, full overlap, 4-line prediction', () => {
        const codeToReplaceData = createCodeToReplaceData`const a = 1
            const b = 2
            const c = 3
            console.log(a, b, c)█
            function greet() { console.log("Hello") }
            const x = 10
            console.log(x)
            console.log("end")
        `

        // 4-line prediction that ends with both suffix lines: "const x = 10" and "console.log(x)"
        const prediction = dedent`const c = 1000
            console.log(a - b - c)
            const x = 10
            console.log(x)
        `

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        // After removing the two overlapping suffix lines ("const x = 10" and "console.log(x)"),
        // we have only 2 lines left from prediction.
        // Original codeToReplace is 3 lines. The function should append original lines to reach 3 lines total.
        expect(result.trimEnd()).toMatchInlineSnapshot(`
          "const c = 1000
          console.log(a - b - c)
          const c = 3"
        `)
    })

    it('cursor at end of file, no overlap, 4-line prediction', () => {
        const codeToReplaceData = createCodeToReplaceData`line1
            line2
            line3█
        `

        // 4-line prediction rewriting line3 and adding more lines.
        const prediction = dedent`line3_modified
            extra_line1
            extra_line2
            extra_line3
        `

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        // codeToReplace is smaller, but we have more lines in prediction. No overlap removal needed.
        expect(result.trimEnd()).toBe(prediction)
    })

    it('cursor near start, partial overlap, 4-line prediction', () => {
        const codeToReplaceData = createCodeToReplaceData`console.log("start")█
            let val = 123
            console.log("end")
        `

        // 4-line prediction tries to rewrite "console.log("start")" and includes "console.log("end")" at the end for overlap.
        const prediction = dedent`console.log("modified start")
            let val = 999
            extra_line_here
            console.log("end")
        `

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        // Removing overlap "console.log("end")", leaves us with 3 lines.
        expect(result.trimEnd()).toBe(withoutLastLines(prediction, 1))
    })

    it('returns the original text in case of full match with the suffix', () => {
        const codeToReplaceData = createCodeToReplaceData`function test() {
            █const a = 1;
            const b = 2;
            console.log(a + b);
        }`

        const prediction = dedent`function test() {
            const a = 1;
            const b = 2;
            console.log(a + b);
        }`

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        expect(result).toBe(codeToReplaceData.codeToRewrite)
    })
})

function createCodeToReplaceData(code: TemplateStringsArray, ...values: unknown[]): CodeToReplaceData {
    const { document, position } = documentAndPosition(dedent(code, values))
    const docContext = getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 100,
        maxSuffixLength: 100,
    })

    return getCurrentFilePromptComponents({
        docContext,
        position,
        document,
        maxPrefixLinesInArea: 2,
        maxSuffixLinesInArea: 2,
        codeToRewritePrefixLines: 1,
        codeToRewriteSuffixLines: 1,
    }).codeToReplace
}

function withoutLastLines(text: string, n: number): string {
    return text
        .split('\n')
        .slice(0, n > 0 ? -n : 0)
        .join('\n')
}
