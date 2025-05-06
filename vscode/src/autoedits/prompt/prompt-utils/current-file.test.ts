import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { getCurrentDocContext } from '../../../completions/get-current-doc-context'
import { documentAndPosition } from '../../../completions/test-helpers'
import { getCodeToReplaceData } from './code-to-replace'
import { getCurrentFileLongSuggestionPrompt, getCurrentFilePromptComponents } from './current-file'

describe('getCurrentFilePromptComponents and getCurrentFileLongSuggestionPrompt', () => {
    it('handles the markers correctly for current file context', () => {
        // Create a large file content
        const longPrefix = Array(10).fill('prefix-line').join('\n')
        const longSuffix = Array(10).fill('suffix-line').join('\n')
        const content = `${longPrefix}\ncursor█line\n${longSuffix}`

        const { document, position } = documentAndPosition(content)
        const maxPrefixLength = 100
        const maxSuffixLength = 100

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength,
            maxSuffixLength,
        })

        const codeToReplaceData = getCodeToReplaceData({
            docContext,
            position,
            document,
            tokenBudget: {
                maxPrefixLinesInArea: 1,
                maxSuffixLinesInArea: 1,
                codeToRewritePrefixLines: 1,
                codeToRewriteSuffixLines: 1,
                prefixTokens: 100,
                suffixTokens: 100,
            },
        })

        const result = getCurrentFilePromptComponents({
            document,
            codeToReplaceDataRaw: codeToReplaceData,
        })
        expect(result.fileWithMarkerPrompt.toString()).toBe(dedent`
            (\`test.ts\`)
            <file>
            prefix-line
            prefix-line
            prefix-line
            prefix-line
            prefix-line
            prefix-line

            <<<AREA_AROUND_CODE_TO_REWRITE_WILL_BE_INSERTED_HERE>>>
            suffix-line
            suffix-line
            suffix-line
            suffix-line
            suffix-line
            suffix-line

            </file>
        `)
        expect(result.areaPrompt.toString()).toMatchInlineSnapshot(`
          "<area_around_code_to_rewrite>
          prefix-line

          <code_to_rewrite>
          prefix-line
          cursorline
          suffix-line

          </code_to_rewrite>
          suffix-line

          </area_around_code_to_rewrite>"
        `)
    })

    it('handles the markers correctly for all content under area prompt', () => {
        // Create a large file content
        const longPrefix = Array(10).fill('prefix-line').join('\n')
        const longSuffix = Array(10).fill('suffix-line').join('\n')
        const content = `${longPrefix}\ncursor█line\n${longSuffix}`

        const { document, position } = documentAndPosition(content)

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 30,
            maxSuffixLength: 30,
        })

        const codeToReplaceData = getCodeToReplaceData({
            docContext,
            position,
            document,
            tokenBudget: {
                maxPrefixLinesInArea: 1,
                maxSuffixLinesInArea: 1,
                codeToRewritePrefixLines: 1,
                codeToRewriteSuffixLines: 1,
                prefixTokens: 100,
                suffixTokens: 100,
            },
        })

        const result = getCurrentFilePromptComponents({
            document,
            codeToReplaceDataRaw: codeToReplaceData,
        })
        expect(result.fileWithMarkerPrompt.toString()).toBe(dedent`
            (\`test.ts\`)
            <file>
            <<<AREA_AROUND_CODE_TO_REWRITE_WILL_BE_INSERTED_HERE>>>
            </file>
        `)
        expect(result.areaPrompt.toString()).toMatchInlineSnapshot(`
          "<area_around_code_to_rewrite>
          prefix-line

          <code_to_rewrite>
          prefix-line
          cursorline
          suffix-line

          </code_to_rewrite>
          suffix-line

          </area_around_code_to_rewrite>"
        `)
    })

    it('builds correct prompt for long suggestions', () => {
        // Create a large file content
        const longPrefix = Array(10).fill('prefix-line').join('\n')
        const longSuffix = Array(10).fill('suffix-line').join('\n')
        const content = `${longPrefix}\ncursor█line\n${longSuffix}`

        const { document, position } = documentAndPosition(content)

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 30,
            maxSuffixLength: 30,
        })

        const codeToReplaceData = getCodeToReplaceData({
            docContext,
            position,
            document,
            tokenBudget: {
                maxPrefixLinesInArea: 1,
                maxSuffixLinesInArea: 1,
                codeToRewritePrefixLines: 1,
                codeToRewriteSuffixLines: 1,
                prefixTokens: 100,
                suffixTokens: 100,
            },
        })

        const result = getCurrentFileLongSuggestionPrompt({
            document,
            codeToReplaceDataRaw: codeToReplaceData,
        })

        const expectedOutput = dedent`
            (\`test.ts\`)
            <file>
            prefix-line
            <|editable_region_start|>
            prefix-line
            cursor<|user_cursor_is_here|>line
            suffix-line
            <|editable_region_end|>
            suffix-line
            </file>
        `
        expect(result.toString()).toBe(expectedOutput)
    })
})
