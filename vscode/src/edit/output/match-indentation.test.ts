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
    it('returns correct when incoming has the same indentation as original', () => {
        const incoming = EXAMPLE_WHITESPACE_RESPONSE
        const updated = matchIndentation(incoming, EXAMPLE_WHITESPACE_RESPONSE)
        expect(updated).toBe(EXAMPLE_WHITESPACE_RESPONSE)
    })

    describe('whitespace indentation', () => {
        it('returns correct when incoming has less indentation as original', () => {
            const incoming = EXAMPLE_WHITESPACE_RESPONSE
            const indentedOriginal = EXAMPLE_WHITESPACE_RESPONSE.split('\n')
                .map(line => line.padStart(line.length + 1)) // Add a space to the start of each line
                .join('\n')
            const updated = matchIndentation(incoming, indentedOriginal)
            expect(updated).toBe(indentedOriginal)
        })

        it('returns correct when incoming has more indentation then original', () => {
            const incoming = EXAMPLE_WHITESPACE_RESPONSE.split('\n')
                .map(line => line.padStart(line.length + 1)) // Add a space to the start of each line
                .join('\n')
            const updated = matchIndentation(incoming, EXAMPLE_WHITESPACE_RESPONSE)
            expect(updated).toBe(EXAMPLE_WHITESPACE_RESPONSE)
        })
    })

    describe('tab indentation', () => {
        it('returns correct when incoming has less indentation as original', () => {
            const incoming = EXAMPLE_TAB_RESPONSE
            const indentedOriginal = EXAMPLE_TAB_RESPONSE.split('\n')
                .map(line => '\t' + line) // Adding another tab at the start of each line
                .join('\n')
            const updated = matchIndentation(incoming, indentedOriginal)
            expect(updated).toBe(indentedOriginal)
        })

        it('returns correct when incoming has more indentation than original', () => {
            const incoming = EXAMPLE_TAB_RESPONSE.split('\n')
                .map(line => '\t' + line) // Adding a tab at the start of each line
                .join('\n')
            const updated = matchIndentation(incoming, EXAMPLE_TAB_RESPONSE)
            expect(updated).toBe(EXAMPLE_TAB_RESPONSE)
        })
    })
})
