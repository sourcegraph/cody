import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { InsertedCharactersLogger } from './InsertedCharactersLogger'

describe('InsertedCharactersLogger', () => {
    let tracker: InsertedCharactersLogger
    let onDidChangeTextDocument: (event: vscode.TextDocumentChangeEvent) => void
    beforeEach(() => {
        tracker = new InsertedCharactersLogger({
            onDidChangeTextDocument(listener) {
                onDidChangeTextDocument = listener
                return { dispose: () => {} }
            },
        })
    })
    afterEach(() => {
        tracker.dispose()
    })

    it('returns 0 keystrokes on first call', () => {
        expect(tracker.getKeystrokesSinceLastCall()).toBe(0)
    })

    it('returns number of inserted characters', () => {
        const changeEvent = {
            contentChanges: [
                {
                    text: 'foo',
                },
            ],
        } as unknown as vscode.TextDocumentChangeEvent

        onDidChangeTextDocument(changeEvent)

        expect(tracker.getKeystrokesSinceLastCall()).toBe(3)
    })

    it('resets counter after getKeystrokesSinceLastCall', () => {
        const changeEvent1 = {
            contentChanges: [
                {
                    text: 'foo',
                },
            ],
        } as unknown as vscode.TextDocumentChangeEvent

        const changeEvent2 = {
            contentChanges: [
                {
                    text: 'bar\nyay',
                },
            ],
        } as unknown as vscode.TextDocumentChangeEvent

        onDidChangeTextDocument(changeEvent1)
        expect(tracker.getKeystrokesSinceLastCall()).toBe(3)

        onDidChangeTextDocument(changeEvent2)
        expect(tracker.getKeystrokesSinceLastCall()).toBe(7)
    })
})
