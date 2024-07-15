import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { telemetryRecorder } from '@sourcegraph/cody-shared'
import { document } from '../completions/test-helpers'
import { range } from '../testutils/textDocument'
import { CharactersLogger, LOG_INTERVAL } from './CharactersLogger'

const testDocument = document('foo')
describe('CharactersLogger', () => {
    let recordSpy: MockInstance
    let tracker: CharactersLogger
    let onDidChangeTextDocument: (event: vscode.TextDocumentChangeEvent) => void
    beforeEach(() => {
        vi.useFakeTimers()

        recordSpy = vi.spyOn(telemetryRecorder, 'recordEvent')

        tracker = new CharactersLogger({
            onDidChangeTextDocument(listener) {
                onDidChangeTextDocument = listener
                return { dispose: () => {} }
            },
        })
    })
    afterEach(() => {
        tracker.dispose()
        vi.clearAllTimers()
    })

    function createChange(
        text: string,
        range: vscode.Range,
        rangeLength: number
    ): vscode.TextDocumentChangeEvent {
        return {
            document: testDocument,
            reason: undefined,
            contentChanges: [
                {
                    text,
                    range,
                    rangeLength,
                    rangeOffset: range.start.character,
                },
            ],
        }
    }

    it('returns 0 after LOG_INTERVAL', () => {
        vi.advanceTimersByTime(LOG_INTERVAL - 1)
        expect(recordSpy).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 0,
                deletedCharacters: 0,
            },
        })
    })

    it('returns number of inserted characters', () => {
        onDidChangeTextDocument(createChange('foo', range(0, 0, 0, 0), 0))
        onDidChangeTextDocument(createChange('bar', range(0, 3, 0, 3), 0))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 6,
                deletedCharacters: 0,
            },
        })
    })

    it('returns number of deleted characters', () => {
        onDidChangeTextDocument(createChange('', range(0, 0, 0, 3), 3))
        onDidChangeTextDocument(createChange('', range(0, 0, 0, 3), 3))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 0,
                deletedCharacters: 6,
            },
        })
    })

    it('calculates the number of actually changed characters', () => {
        // replacing `foo` with `fob` should result in 3 deletions and 3 insertions
        onDidChangeTextDocument(createChange('fob', range(0, 0, 0, 3), 3))
        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 3,
                deletedCharacters: 3,
            },
        })
    })

    it('handles multi-line changes', () => {
        // Delete 2 lines and insert 1 line
        onDidChangeTextDocument(createChange('new line', range(0, 0, 2, 0), 20))
        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 8,
                deletedCharacters: 20,
            },
        })
    })

    it('resets counter after flushing', () => {
        onDidChangeTextDocument(createChange('foo', range(0, 0, 0, 0), 0))
        onDidChangeTextDocument(createChange('bar', range(0, 3, 0, 3), 0))
        onDidChangeTextDocument(createChange('', range(0, 0, 0, 3), 3))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 6,
                deletedCharacters: 3,
            },
        })

        onDidChangeTextDocument(createChange('baz', range(0, 3, 0, 3), 0))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 3,
                deletedCharacters: 0,
            },
        })
    })
})
