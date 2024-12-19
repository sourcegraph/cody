import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { getCurrentDocContext } from '../completions/get-current-doc-context'
import { documentAndPosition } from '../completions/test-helpers'

import { type CodeToReplaceData, getCurrentFilePromptComponents } from './prompt/prompt-utils'
import { shrinkPredictionUntilSuffix } from './shrink-prediction'

describe('shrinkPredictionUntilSuffix', () => {
    it('does not trim the prediction lines that start with the same indentation as the following suffix empty lines', () => {
        const codeToReplaceData = createCodeToReplaceData`
            import { RecentEditsTracker } from '../completions/context/retrievers/recent-user-actions/recent-edits-tracker'

            export class FilterPredictionEditsBasedOnRecentEdits {

                private readonly recentEditsTracker: RecentEditsTracker

                constructor(recentEditsTracker: RecentEditsTracker) {
                    this.recentEditsTracker = █









                    // some code
        `

        const prediction = dedent`    constructor(recentEditsTracker: RecentEditsTracker) {
            this.recentEditsTracker = recentEditsTracker
            pred_line_1
            pred_line_2\n
        `

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        expect(result).toBe(prediction)
    })

    it('returns code to rewrite if the prediction does not change anything', () => {
        const codeToReplaceData = createCodeToReplaceData`
            import { RecentEditsTracker } from '../completions/context/retrievers/recent-user-actions/recent-edits-tracker'

            export class FilterPredictionEditsBasedOnRecentEdits {

                private readonly recentEditsTracker: RecentEditsTracker

                constructor(recentEditsTracker: RecentEditsTracker) {
                    this.recentEditsTracker = █
                }

            }\n\n
        `

        const prediction = dedent`    constructor(recentEditsTracker: RecentEditsTracker) {
            this.recentEditsTracker = recentEditsTracker
        }\n\n`

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        expect(result).toBe(prediction)
    })

    it('if prediction suggests line additions which duplicate the existing document suffix, remove them from prediction', () => {
        const codeToReplaceData = createCodeToReplaceData`class ContactForm:
            def __init__(self█, name, message):
                pass
                pass
                self.email = email
        `

        // Prediction with 4 lines; the last line exactly matches the suffix line "self.email = email".
        const prediction = dedent`class ContactForm:
            def __init__(self, name, message, email):
                pass
                pass
                self.email = email
        `

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        // We expect that last line to be removed (overlap is 1 line).
        expect(result.trimEnd()).toBe(withoutLastLines(prediction, 1))
    })

    it('cursor at end of file, no overlap, 4-line prediction', () => {
        const codeToReplaceData = createCodeToReplaceData`line1
            line2
            line3█
        `

        const prediction = dedent`line3_modified
            extra_line1
            extra_line2
            extra_line3
        `

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        // No overlap to remove, so the prediction remains.
        expect(result.trimEnd()).toBe(prediction.trimEnd())
    })

    it('cursor near start, partial overlap, 4-line prediction', () => {
        const codeToReplaceData = createCodeToReplaceData`console.log("start")█
            let value = 123
            console.log(value)
            console.log("end")
        `

        // The last line of prediction "console.log('end')" exactly matches the first line in the suffix "console.log('end')".
        const prediction = dedent`console.log("modified start")
            let value = 999
            console.log(value)
            extra_line_here
            console.log("end")
        `

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
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

    it('handles empty suffix (no overlap possible)', () => {
        const codeToReplaceData = createCodeToReplaceData`test code█`
        const prediction = dedent`
            test code changed
            more lines\n
        `

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        expect(result).toBe(prediction)
    })

    it('handles empty prediction', () => {
        const codeToReplaceData = createCodeToReplaceData`some code█
            suffix line1
            suffix line2
        `

        const prediction = ''

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        expect(result).toBe(prediction)
    })

    it('handles partial line mismatch properly (no partial/startsWith overlap)', () => {
        const codeToReplaceData = createCodeToReplaceData`console.log("foo")█
            console.log("bar")
        `

        // The predicted line "console.log("barbaz")" is not an exact match, so no overlap is removed.
        const prediction = dedent`console.log("foo changed")
            console.log("barbaz")\n
        `

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        expect(result).toBe(prediction)
    })

    it('removes all lines if prediction fully matches suffix line-by-line', () => {
        // codeToRewrite is a single line; suffix has 2 lines; the prediction is exactly those 2 lines.
        const codeToReplaceData = createCodeToReplaceData`
            foo█


            line1
            line2\n
        `

        const prediction = dedent`

            line1
            line2\n
        `

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        // Entire prediction is removed => only a single newline remains.
        expect(result).toBe('\n')
    })

    it('removes overlapping lines even if they are empty', () => {
        const codeToReplaceData = createCodeToReplaceData`line1█
            line2


            line3
            line4
        `

        const prediction = dedent`line1 changed
            line2


            line3
            line4\n
        `

        const result = shrinkPredictionUntilSuffix(prediction, codeToReplaceData)
        expect(result).toBe(withoutLastLines(prediction, 3))
    })
})

function createCodeToReplaceData(code: TemplateStringsArray, ...values: unknown[]): CodeToReplaceData {
    const { document, position } = documentAndPosition(dedent(code, values))
    const docContext = getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 1000,
        maxSuffixLength: 1000,
    })

    return getCurrentFilePromptComponents({
        docContext,
        position,
        document,
        maxPrefixLinesInArea: 5,
        maxSuffixLinesInArea: 5,
        codeToRewritePrefixLines: 1,
        codeToRewriteSuffixLines: 2,
    }).codeToReplace
}

function withoutLastLines(text: string, n: number): string {
    return text
        .split('\n')
        .slice(0, n > 0 ? -n : undefined)
        .join('\n')
}
