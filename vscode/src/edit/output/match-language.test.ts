import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { FixupFile } from '../../non-stop/FixupFile'
import type { FixupTask } from '../../non-stop/FixupTask'
import { matchLanguage } from './match-language'

const EXAMPLE_RESPONSE = `export function log(text: string): void {
    console.log(text)
}`

describe('matchLanguage', () => {
    describe('unsupported language', () => {
        it('returns the original response', () => {
            const mockTask = {
                fixupFile: new FixupFile(1, vscode.Uri.parse('file:///foo.go')),
                original: EXAMPLE_RESPONSE,
            } as FixupTask
            const incoming = EXAMPLE_RESPONSE
            const updated = matchLanguage(incoming, mockTask.original, mockTask.fixupFile.uri)
            expect(updated).toBe(EXAMPLE_RESPONSE)
        })
    })

    describe('javascript', () => {
        it('removes semi-colons from the end of lines', () => {
            const mockTask = {
                fixupFile: new FixupFile(1, vscode.Uri.parse('file:///foo.js')),
                original: EXAMPLE_RESPONSE,
            } as FixupTask
            const incomingWithSemicolons = EXAMPLE_RESPONSE.replace(
                'console.log(text)',
                'console.log(text);'
            )
            const updated = matchLanguage(
                incomingWithSemicolons,
                mockTask.original,
                mockTask.fixupFile.uri
            )
            expect(updated).toBe(EXAMPLE_RESPONSE)
        })

        it('does not remove semi-colons from within lines', () => {
            const mockTask = {
                fixupFile: new FixupFile(1, vscode.Uri.parse('file:///foo.js')),
                original: EXAMPLE_RESPONSE,
            } as FixupTask
            const incomingWithSemicolons = EXAMPLE_RESPONSE.replace('console', 'console;')
            const updated = matchLanguage(
                incomingWithSemicolons,
                mockTask.original,
                mockTask.fixupFile.uri
            )
            expect(updated).toBe(incomingWithSemicolons)
        })
    })
})
