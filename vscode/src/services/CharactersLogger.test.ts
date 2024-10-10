import type { Writable } from 'type-fest'
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
    let onDidChangeWindowState: (state: vscode.WindowState) => void
    let onDidChangeVisibleTextEditors: (editors: vscode.TextEditor[]) => void
    let onDidChangeTextEditorSelection: (event: vscode.TextEditorSelectionChangeEvent) => void

    let mockWindowState: Writable<vscode.WindowState>
    let mockVisibleTextEditors: vscode.TextEditor[]
    let mockTextEditorSelectionEvent: vscode.TextEditorSelectionChangeEvent

    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(0) // Start at timestamp 0 for consistency

        recordSpy = vi.spyOn(telemetryRecorder, 'recordEvent')

        // Mock functions and variables
        mockWindowState = { focused: true }
        mockVisibleTextEditors = [{ document: testDocument } as vscode.TextEditor]

        mockTextEditorSelectionEvent = {
            textEditor: { document: testDocument } as vscode.TextEditor,
            selections: [],
            kind: undefined,
        }

        tracker = new CharactersLogger(
            {
                onDidChangeTextDocument(listener) {
                    onDidChangeTextDocument = listener
                    return { dispose: () => {} }
                },
            },
            {
                onDidChangeWindowState(listener) {
                    onDidChangeWindowState = listener
                    return { dispose: () => {} }
                },
                onDidChangeVisibleTextEditors(listener) {
                    onDidChangeVisibleTextEditors = listener
                    return { dispose: () => {} }
                },
                onDidChangeTextEditorSelection(listener) {
                    onDidChangeTextEditorSelection = listener
                    return { dispose: () => {} }
                },
                visibleTextEditors: mockVisibleTextEditors,
            }
        )
    })

    afterEach(() => {
        tracker.dispose()
        vi.clearAllTimers()
        vi.resetAllMocks()
    })

    function createChange({
        text,
        range,
        rangeLength,
        document = testDocument,
        reason,
    }: {
        text: string
        range: vscode.Range
        rangeLength: number
        document?: vscode.TextDocument
        reason?: vscode.TextDocumentChangeReason
    }): vscode.TextDocumentChangeEvent {
        return {
            document,
            reason,
            contentChanges: [
                {
                    text,
                    range,
                    rangeLength,
                    rangeOffset: document.offsetAt(range.start),
                },
            ],
        }
    }

    it('logs inserted and deleted characters for user edits', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'bar', range: range(0, 3, 0, 3), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 6,
                deletedCharacters: 0,
            },
        })
    })

    it('ignores changes when window is not focused', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        // Simulate window losing focus
        mockWindowState.focused = false
        onDidChangeWindowState(mockWindowState)

        onDidChangeTextDocument(createChange({ text: 'bar', range: range(0, 3, 0, 3), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        // Only the first change should be counted
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 3,
                deletedCharacters: 0,
            },
        })
    })

    it('ignores changes in non-visible documents', () => {
        // Remove testDocument from visible editors
        mockVisibleTextEditors = []
        onDidChangeVisibleTextEditors(mockVisibleTextEditors)

        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        // No changes should be counted
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 0,
                deletedCharacters: 0,
            },
        })
    })

    it('ignores changes when there has been no recent cursor movement', () => {
        // Simulate last selection happened 6 seconds ago
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        vi.advanceTimersByTime(6000)

        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL - 6000)

        // No changes should be counted
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 0,
                deletedCharacters: 0,
            },
        })
    })

    it('ignores undo and redo changes', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        const undoIdentifier = 1

        // Simulate undo change
        onDidChangeTextDocument(
            createChange({
                text: '',
                range: range(0, 0, 0, 3),
                rangeLength: 3,
                document: testDocument,
                reason: undoIdentifier,
            })
        )

        vi.advanceTimersByTime(LOG_INTERVAL)

        // No changes should be counted
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 0,
                deletedCharacters: 0,
            },
        })
    })

    it('ignores rapid, large changes likely caused by external operations', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)

        // Simulate large change (e.g., 2000 characters inserted)
        const largeText = 'a'.repeat(2000)
        onDidChangeTextDocument(
            createChange({ text: largeText, range: range(0, 0, 0, 0), rangeLength: 0 })
        )

        vi.advanceTimersByTime(LOG_INTERVAL)

        // No changes should be counted due to large change heuristic
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 0,
                deletedCharacters: 0,
            },
        })
    })

    it('counts large changes if they are not rapid', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)

        // Simulate large change after some time has passed
        vi.advanceTimersByTime(2000) // Advance time beyond LARGE_CHANGE_TIMEOUT
        const largeText = 'a'.repeat(2000)
        onDidChangeTextDocument(
            createChange({ text: largeText, range: range(0, 0, 0, 0), rangeLength: 0 })
        )

        vi.advanceTimersByTime(LOG_INTERVAL - 2000)

        // The large change should be counted
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 2000,
                deletedCharacters: 0,
            },
        })
    })

    it('resets counter after flushing', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 3,
                deletedCharacters: 0,
            },
        })

        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'bar', range: range(0, 3, 0, 3), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledTimes(2)
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 3,
                deletedCharacters: 0,
            },
        })
    })

    it('does not ignore user typing after cursor movement', () => {
        // Simulate user moving the cursor
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)

        // Simulate user typing
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        // Changes should be counted
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 3,
                deletedCharacters: 0,
            },
        })
    })

    it('handles multiple documents and selections', () => {
        const anotherDocument = document('bar')
        mockVisibleTextEditors.push({
            document: anotherDocument,
        } as vscode.TextEditor)
        onDidChangeVisibleTextEditors(mockVisibleTextEditors)

        // Simulate cursor movement in both documents
        onDidChangeTextEditorSelection({
            textEditor: {
                document: testDocument,
            } as vscode.TextEditor,
            selections: [],
            kind: undefined,
        })
        onDidChangeTextEditorSelection({
            textEditor: {
                document: anotherDocument,
            } as vscode.TextEditor,
            selections: [],
            kind: undefined,
        })

        // Simulate changes in both documents
        onDidChangeTextDocument(
            createChange({
                text: 'foo',
                range: range(0, 0, 0, 0),
                rangeLength: 0,
                document: testDocument,
            })
        )
        onDidChangeTextDocument(
            createChange({
                text: 'baz',
                range: range(0, 0, 0, 0),
                rangeLength: 0,
                document: anotherDocument,
            })
        )

        vi.advanceTimersByTime(LOG_INTERVAL)

        // Changes in both documents should be counted
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: {
                insertedCharacters: 6,
                deletedCharacters: 0,
            },
        })
    })
})
