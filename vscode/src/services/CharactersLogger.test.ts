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

    function createInsertion(
        text: string,
        insertRange: vscode.Range = range(0, 0, 0, 0)
    ): vscode.TextDocumentChangeEvent {
        return {
            document: testDocument,
            reason: undefined,
            contentChanges: [
                {
                    text,
                    range: insertRange,
                    rangeLength: 0,
                    rangeOffset: 0,
                },
            ],
        }
    }

    function createDeletion(range: vscode.Range): vscode.TextDocumentChangeEvent {
        return {
            document: testDocument,
            reason: undefined,
            contentChanges: [
                {
                    text: '',
                    range,
                    rangeLength: range.end.character - range.start.character,
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
        onDidChangeTextDocument(createInsertion('foo'))
        onDidChangeTextDocument(createInsertion('bar'))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 6,
                deletedCharacters: 0,
            },
        })
    })

    it('returns number of deleted characters', () => {
        onDidChangeTextDocument(createDeletion(range(0, 0, 0, 3)))
        onDidChangeTextDocument(createDeletion(range(0, 0, 0, 3)))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 0,
                deletedCharacters: 6,
            },
        })
    })

    it('calculates the number of actually changed characters', () => {
        // replacing `foo` with `fob` should result in 1 addition and 1 deletion
        onDidChangeTextDocument(createInsertion('fob', range(0, 0, 0, 3)))
        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 1,
                deletedCharacters: 1,
            },
        })
    })

    it('resets counter after flushing', () => {
        onDidChangeTextDocument(createInsertion('foo'))
        onDidChangeTextDocument(createInsertion('bar'))
        onDidChangeTextDocument(createDeletion(range(0, 0, 0, 3)))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 6,
                deletedCharacters: 3,
            },
        })

        onDidChangeTextDocument(createInsertion('baz'))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 3,
                deletedCharacters: 0,
            },
        })
    })
})
