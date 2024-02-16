import { describe, it, expect } from 'vitest'

import { getAtMentionedInputText } from './at-mentioned'

describe('getAtMentionedInputText', () => {
    it('returns null when filePath is empty', () => {
        const result = getAtMentionedInputText('', 'Hello @world', 5)
        expect(result).toBeUndefined()
    })

    it('returns null when caretPosition is invalid', () => {
        const result = getAtMentionedInputText('@src/file.ts', 'Hello world', -1)
        expect(result).toBeUndefined()
    })

    // Explain:
    // 1. Text is from the user form input with the {CURSOR} representing the caretPosition:
    // 'Hello @user/fil{CURSOR} @another/file.ts'
    // 2. When a user hits tab / space, we will replace the {CURSOR} with the "completed" file name:
    // 'Hello @user/file.ts @another/file.ts'
    it('replaces all at-mentions', () => {
        const result = getAtMentionedInputText(
            '@src/file.ts', // file name
            'Hello @user/fil @another/file.ts', // form input
            'Hello @user/fil'.length // caretPosition
        )
        expect(result).toEqual({
            newInput: 'Hello @src/file.ts @another/file.ts',
            newInputCaretPosition: 19,
        })
    })

    it('handles at-mention with no preceding space', () => {
        const result = getAtMentionedInputText(
            '@src/file.ts',
            'Hello @old/file.ts',
            'Hello @old/file.ts'.length
        )
        expect(result).toEqual({
            newInput: 'Hello @src/file.ts ',
            newInputCaretPosition: 19,
        })
    })

    it('returns undefined if no @ in input', () => {
        const result = getAtMentionedInputText('@src/file.ts', 'Hello world', 5)
        expect(result).toBeUndefined()
    })

    it('returns updated input text and caret position', () => {
        const result = getAtMentionedInputText(
            '@src/file.ts',
            'Hello @old/file.ts: world',
            'Hello @old/file.ts:'.length,
            true
        )
        expect(result).toEqual({
            newInput: 'Hello @src/file.ts: world',
            newInputCaretPosition: 19,
        })
    })

    it('handles no text after caret', () => {
        const result = getAtMentionedInputText(
            '@src/file.ts',
            'Hello @old/file.ts ',
            'Hello @old/file.ts'.length
        )
        expect(result).toEqual({
            newInput: 'Hello @src/file.ts ',
            newInputCaretPosition: 19,
        })
    })

    it('handles colon based on param', () => {
        let result = getAtMentionedInputText(
            '@src/file.ts',
            'Hello @old/file.ts ',
            'Hello @old/file.ts '.length,
            true
        )
        expect(result?.newInput).toContain('@src/file.ts:')

        result = getAtMentionedInputText(
            '@src/file.ts',
            'Hello @old/file.ts',
            'Hello @old/file.ts'.length,
            false
        )
        expect(result?.newInput).toContain('@src/file.ts ')
    })
})
