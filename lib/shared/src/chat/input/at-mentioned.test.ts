import { describe, expect, it } from 'vitest'

import { extractMentionQuery, getAtMentionedInputText } from './at-mentioned'

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
            'Hello @src/file.ts',
            'Hello @src/file.ts'.length
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
            'Hello @src/file.ts: world',
            'Hello @src/file.ts:'.length,
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
            'Hello @src/file.ts ',
            'Hello @src/file.ts'.length
        )
        expect(result).toEqual({
            newInput: 'Hello @src/file.ts ',
            newInputCaretPosition: 19,
        })
    })

    it('handles colon based on param', () => {
        let result = getAtMentionedInputText(
            '@src/file.ts',
            'Hello @src/file.ts ',
            'Hello @src/file.ts '.length,
            true
        )
        expect(result?.newInput).toContain('@src/file.ts:')

        result = getAtMentionedInputText(
            '@src/file.ts',
            'Hello @src/file.ts',
            'Hello @src/file.ts'.length,
            false
        )
        expect(result?.newInput).toContain('@src/file.ts ')
    })

    it('keeps range', () => {
        const result = getAtMentionedInputText(
            '@src/file.ts',
            'Hello @src/file.ts:1-7',
            'Hello @src/file.ts:1-7'.length,
            false
        )
        expect(result?.newInput).toContain('Hello @src/file.ts:1-7 ')
    })
})

describe('extractMentionQuery', () => {
    it('returns empty string if no @ in input', () => {
        const query = extractMentionQuery('Hello world', 'Hello world'.length)
        expect(query).toEqual('')
    })

    it('returns empty string if caret before last @', () => {
        const query = extractMentionQuery('@foo Hello world', 0)
        expect(query).toEqual('')
    })

    it('returns empty string if there is no space in front of @', () => {
        const query = extractMentionQuery('Explain@foo', 0)
        expect(query).toEqual('')
    })

    it('extracts mention between last @ and caret', () => {
        const query = extractMentionQuery('@foo/bar Hello @world', '@foo/bar Hello @world'.length)
        expect(query).toEqual('@world')
    })

    it('handles no text and space after caret', () => {
        const query = extractMentionQuery('@foo/bar', '@foo/bar'.length)
        expect(query).toEqual('@foo/bar')
    })

    it('handles space at caret after query', () => {
        const query = extractMentionQuery('@foo/bar ', '@foo/bar '.length)
        expect(query).toEqual('@foo/bar ')
    })

    it('returns full mention query with suffix', () => {
        const query = extractMentionQuery('@foo/bar:10 world', '@foo/bar:10 '.length)
        expect(query).toEqual('@foo/bar:10 world')
    })
})
