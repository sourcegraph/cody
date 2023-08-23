import { describe, expect, it, test } from 'vitest'
import * as vscode from 'vscode'

import { countCode, editDocByUri, matchCodeSnippets, updateRangeOnDocChange } from './InlineAssist'

describe('UpdateRangeOnDocChange returns a new selection range by calculating lines of code changed in current docs', () => {
    it('Returns current Range if change occurs after the current selected range', () => {
        const cur = new vscode.Range(1, 0, 3, 0)
        const change = new vscode.Range(5, 0, 10, 0)
        const result = updateRangeOnDocChange(cur, change, '')
        expect(result).toEqual(cur)
    })
    it('Updates range by number of lines added within the current selected range', () => {
        const cur = new vscode.Range(5, 6, 8, 9)
        const change = new vscode.Range(6, 0, 5, 0)
        const changeText = 'line6'
        const result = updateRangeOnDocChange(cur, change, changeText)
        expect(result).toEqual(new vscode.Range(5, 0, 8, 0))
    })
    it('Updates range by number of lines removed within the current selected range', () => {
        const cur = new vscode.Range(1, 6, 5, 9)
        const change = new vscode.Range(2, 0, 3, 0)
        const changeText = 'line2\nline3'
        const result = updateRangeOnDocChange(cur, change, changeText)
        expect(result).toEqual(new vscode.Range(1, 0, 6, 0))
    })
    it('Updates range by number of lines added above the current selected range', () => {
        const cur = new vscode.Range(7, 0, 10, 0)
        const change = new vscode.Range(1, 0, 5, 0)
        const changeText = 'line1\nline2'
        const result = updateRangeOnDocChange(cur, change, changeText)
        expect(result).toEqual(new vscode.Range(8, 0, 11, 0))
    })
    it('Updates range by number of lines added overlap the current selected range', () => {
        const cur = new vscode.Range(1, 0, 3, 0)
        const change = new vscode.Range(1, 0, 3, 0)
        const changeText = 'line1\nline2\nline3'
        const result = updateRangeOnDocChange(cur, change, changeText)
        expect(result).toEqual(new vscode.Range(3, 0, 5, 0))
    })
    it('Updates range by number of lines removed before the current selected range', () => {
        const cur = new vscode.Range(5, 0, 10, 0)
        const change = new vscode.Range(1, 0, 3, 0)
        const changeText = 'line0'
        const result = updateRangeOnDocChange(cur, change, changeText)
        expect(result).toEqual(new vscode.Range(3, 0, 8, 0))
    })
})

describe('editDocByUri returns a new selection range by calculating lines of code edited by Cody', () => {
    test('replaces a single line in a document', async () => {
        const uri = vscode.Uri.file('/tmp/test.txt')
        const lines = { start: 1, end: 3 }
        const content = 'foo\nfoo\nfoo'
        const range = await editDocByUri(uri, lines, content)
        expect(range).toEqual(new vscode.Range(1, 0, 2, 0))
    })

    test('replaces multiple lines in a document', async () => {
        const uri = vscode.Uri.file('/tmp/test.txt')
        const lines = { start: 1, end: 3 }
        const content = 'foo\nbar\nfoo\nbar\nfoo'
        const range = await editDocByUri(uri, lines, content)
        expect(range).toEqual(new vscode.Range(1, 0, 4, 0))
    })
})

describe('countCode', () => {
    it('counts lines correctly', () => {
        const code = `line1
  line2
  line3`
        const result = countCode(code)
        expect(result.lineCount).toBe(3)
    })

    it('counts characters correctly', () => {
        const code = 'foo bar'
        const result = countCode(code)
        expect(result.charCount).toBe(7)
    })

    it('handles windows line endings', () => {
        const code = 'line1\r\nline2\r\nline3'
        const result = countCode(code)
        expect(result.lineCount).toBe(3)
    })

    it('handles empty string', () => {
        const code = ''
        const result = countCode(code)
        expect(result.lineCount).toBe(1)
        expect(result.charCount).toBe(0)
    })
})

describe('matchCodeSnippets', () => {
    it('returns false if either input is empty', () => {
        expect(matchCodeSnippets('', 'foo')).toBe(false)
        expect(matchCodeSnippets('foo', '')).toBe(false)
    })

    it('returns true if inputs match without whitespace', () => {
        const copied = 'foo\nbar'
        const changed = 'foobar'
        expect(matchCodeSnippets(copied, changed)).toBe(true)
    })

    it('returns false if inputs do not match without whitespace', () => {
        const copied = 'foo\nbar'
        const changed = 'foobaz'
        expect(matchCodeSnippets(copied, changed)).toBe(false)
    })

    it('handles trailing whitespace correctly', () => {
        const copied = 'foo '
        const changed = 'foo'
        expect(matchCodeSnippets(copied, changed)).toBe(true)
    })
})
