import dedent from 'dedent'
import detectIndent from 'detect-indent'
import { describe, expect, it } from 'vitest'
import { matchIndentation } from './match-indentation'

const EXAMPLE_WHITESPACE_RESPONSE = `export function log(text: string): void {
    console.log(text)
}`

const EXAMPLE_TAB_RESPONSE = EXAMPLE_WHITESPACE_RESPONSE.split('\n')
    .map(line => {
        const trimmedLine = line.trimStart()
        if (trimmedLine.length === line.length) {
            // no whitespace to append
            return line
        }
        return '\t' + trimmedLine
    })
    .join('\n')

describe('matchIndentation', () => {
    describe('whitespace indentation', () => {
        it('returns correct when incoming has the same indentation as original', () => {
            const incoming = EXAMPLE_WHITESPACE_RESPONSE
            const updated = matchIndentation(incoming, EXAMPLE_WHITESPACE_RESPONSE)
            expect(updated).toBe(EXAMPLE_WHITESPACE_RESPONSE)
        })

        it('returns correct when incoming has less indentation as original', () => {
            const incoming = EXAMPLE_WHITESPACE_RESPONSE
            const indentedOriginal = EXAMPLE_WHITESPACE_RESPONSE.replace('console.log', '  console.log')
            const updated = matchIndentation(incoming, indentedOriginal)
            expect(updated).toBe(indentedOriginal)
        })

        it('returns correct when incoming has more indentation then original', () => {
            const incoming = EXAMPLE_WHITESPACE_RESPONSE.replace('console.log', '  console.log')
            const updated = matchIndentation(incoming, EXAMPLE_WHITESPACE_RESPONSE)
            expect(updated).toBe(EXAMPLE_WHITESPACE_RESPONSE)
        })
    })

    describe('tab indentation', () => {
        it('returns correct when incoming has the same indentation as original', () => {
            const incoming = EXAMPLE_TAB_RESPONSE
            const updated = matchIndentation(incoming, EXAMPLE_TAB_RESPONSE)
            expect(updated).toBe(EXAMPLE_TAB_RESPONSE)
        })

        it('returns correct when incoming has less indentation as original', () => {
            const incoming = EXAMPLE_TAB_RESPONSE
            const indentedOriginal = EXAMPLE_TAB_RESPONSE.replace('console.log', '\tconsole.log')
            const updated = matchIndentation(incoming, indentedOriginal)
            expect(updated).toBe(indentedOriginal)
        })

        it('returns correct when incoming has more indentation than original', () => {
            const incoming = EXAMPLE_TAB_RESPONSE.replace('console.log', '\tconsole.log')
            const updated = matchIndentation(incoming, EXAMPLE_TAB_RESPONSE)
            expect(updated).toBe(EXAMPLE_TAB_RESPONSE)
        })
    })

    describe('mixed indentation', () => {
        it('returns correct when incoming uses tab indentation, and the original uses whitespace indentation', () => {
            const updated = matchIndentation(EXAMPLE_TAB_RESPONSE, EXAMPLE_WHITESPACE_RESPONSE)
            expect(updated).toBe(EXAMPLE_WHITESPACE_RESPONSE)
        })

        it('returns correct when incoming uses whitespace indentation, and the original uses tab indentation', () => {
            const updated = matchIndentation(EXAMPLE_WHITESPACE_RESPONSE, EXAMPLE_TAB_RESPONSE)
            expect(updated).toBe(EXAMPLE_TAB_RESPONSE)
        })
    })

    describe('special cases', () => {
        // LLMs often get the very first line indentation wrong, even though sometimes the rest of the lines are indented correctly
        it('returns correct when the incoming is the same, except the first line has the wrong indentation', () => {
            const original = EXAMPLE_WHITESPACE_RESPONSE.split('\n')
                .map(line => {
                    return ' '.repeat(4) + line // Add an extra 4 spaces to each line
                })
                .join('\n')

            // Incoming has the same indentation, except the first line is wrong
            const incoming = original.trimStart()
            const updated = matchIndentation(incoming, original)
            expect(updated).toBe(original)
        })

        it('returns correct when the incoming has the wrong indentation on every line', () => {
            const original = EXAMPLE_WHITESPACE_RESPONSE.split('\n')
                .map(line => {
                    return ' '.repeat(4) + line // Add an extra 4 spaces to each line
                })
                .join('\n')

            const updated = matchIndentation(EXAMPLE_WHITESPACE_RESPONSE, original)
            expect(updated).toBe(original)
        })

        it('returns correct when the incoming is the same, but with an indentation mismatch AND the first line has the wrong indentation', () => {
            const original = EXAMPLE_TAB_RESPONSE.split('\n')
                .map(line => {
                    return '\t' + line // Add an extra tab to each line
                })
                .join('\n')

            // Incoming with whitespace indentation, and the incorrect starting indentation
            const incoming = original.replace('\t', ' ').trimStart()
            const updated = matchIndentation(incoming, original)
            expect(updated).toBe(original)
        })

        it('returns correct when the incoming is the same, but with an indentation mismatch AND has the wrong indentation on every line', () => {
            const original = EXAMPLE_TAB_RESPONSE.split('\n')
                .map(line => {
                    return '\t' + line // Add an extra tab to each line
                })
                .join('\n')

            // Incoming with whitespace indentation instead
            const incoming = original.replace('\t', '  ')
            const updated = matchIndentation(incoming, original)
            expect(updated).toBe(original)
        })

        // Some edits may occur on files where there is not any indentation yet.
        // This test covers those cases and ensures we do not attempt to match any indentation (as it's likely wrong).
        it('returns correct when we cannot detect indentation in the original code', () => {
            // Original text with any indentation stripped
            const strippedIndentationOriginal = EXAMPLE_WHITESPACE_RESPONSE.split('\n')
                .map(line => line.trimStart())
                .join('\n')
            const incoming = EXAMPLE_WHITESPACE_RESPONSE
            const updated = matchIndentation(incoming, strippedIndentationOriginal)
            expect(updated).toBe(incoming)
        })
    })

    describe('detect-indent', () => {
        // Checks for an issue that was introduced in detect-indent 7.0.0
        // Can close when the following issue is fixed.
        // Issue: https://github.com/sindresorhus/detect-indent/issues/36
        it('correctly filters out single character indentations for multi-line commentes', () => {
            const originalIndent = detectIndent(original)
            const incomingIndent = detectIndent(incoming)
            expect(incomingIndent.amount).toBe(originalIndent.amount)
        })

        const original = dedent`interface Test {
            a: boolean
            b: boolean
            c: boolean
        }`

        const incoming = dedent`interface Test {
            a: boolean
            b: boolean
            /**
             * multi-line comment
             */
            c: boolean
        }`
    })
})
