import { describe, expect, it, test } from 'vitest'

import {
    CLOSING_CODE_TAG,
    collapseDuplicativeWhitespace,
    extractFromCodeBlock,
    OPENING_CODE_TAG,
    trimLeadingWhitespaceUntilNewline,
} from './text-processing'

describe('extractFromCodeBlock', () => {
    it('extracts value from code completion XML tags', () => {
        expect(extractFromCodeBlock(`hello world${CLOSING_CODE_TAG}`)).toBe('hello world')
        expect(extractFromCodeBlock(`<randomTag>hello world</randomTag>${CLOSING_CODE_TAG}`)).toBe(
            '<randomTag>hello world</randomTag>'
        )
        expect(extractFromCodeBlock(`const isEnabled = true${CLOSING_CODE_TAG}something else`)).toBe(
            'const isEnabled = true'
        )
    })

    it('returns the whole string if the closing tag is not found', () => {
        expect(extractFromCodeBlock('hello world')).toBe('hello world')
        expect(extractFromCodeBlock('<randomTag>hello world</randomTag>')).toBe('<randomTag>hello world</randomTag>')
        expect(extractFromCodeBlock('const isEnabled = true // something else')).toBe(
            'const isEnabled = true // something else'
        )
    })

    it('returns an empty string if the opening tag is found', () => {
        expect(extractFromCodeBlock(`${OPENING_CODE_TAG}hello world${CLOSING_CODE_TAG}`)).toBe('')
        expect(extractFromCodeBlock(`hello world${OPENING_CODE_TAG}`)).toBe('')
        expect(extractFromCodeBlock(OPENING_CODE_TAG)).toBe('')
    })
})

describe('trimLeadingWhitespaceUntilNewline', () => {
    test('trims spaces', () => expect(trimLeadingWhitespaceUntilNewline('  \n  a')).toBe('\n  a'))
    test('preserves carriage returns', () => expect(trimLeadingWhitespaceUntilNewline('\t\r\n  a')).toBe('\r\n  a'))
})

describe('collapseDuplicativeWhitespace', () => {
    test('trims space', () => expect(collapseDuplicativeWhitespace('x = ', ' 7')).toBe('7'))
    test('trims identical duplicative whitespace chars', () =>
        expect(collapseDuplicativeWhitespace('x =\t ', '\t 7')).toBe('7'))
    test('trims non-identical duplicative whitespace chars', () =>
        expect(collapseDuplicativeWhitespace('x =\t ', '  7')).toBe('7'))
    test('trims more whitespace chars from completion than in prefix', () => {
        expect(collapseDuplicativeWhitespace('x = ', '  7')).toBe('7')
        expect(collapseDuplicativeWhitespace('x = ', '\t 7')).toBe('7')
    })
    test('does not trim newlines', () => {
        expect(collapseDuplicativeWhitespace('x = ', '\n7')).toBe('\n7')
    })
})
