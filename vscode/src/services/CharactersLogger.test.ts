import type { Writable } from 'type-fest'
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { telemetryRecorder } from '@sourcegraph/cody-shared'

import { document } from '../completions/test-helpers'
import { range } from '../testutils/textDocument'

import {
    CharactersLogger,
    DEFAULT_COUNTERS,
    type DocumentChangeCounters,
    LOG_INTERVAL,
} from './CharactersLogger'

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

    // Helper function to create default metadata counters with expected values
    function expectedCounters(expected: Partial<DocumentChangeCounters>): Record<string, number> {
        return { ...DEFAULT_COUNTERS, ...expected }
    }

    it('logs inserted and deleted characters for user edits', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'bar', range: range(0, 3, 0, 3), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCounters({
                normal_inserted: 6,
                normal_deleted: 0,
            }),
        })
    })

    it('logs changes under "windowNotFocused" when window is not focused', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        // Simulate window losing focus
        mockWindowState.focused = false
        onDidChangeWindowState(mockWindowState)

        onDidChangeTextDocument(createChange({ text: 'bar', range: range(0, 3, 0, 3), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        // Changes while focused and not focused are logged under different types
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCounters({
                normal_inserted: 3,
                normal_deleted: 0,
                windowNotFocused_inserted: 3,
                windowNotFocused_deleted: 0,
            }),
        })
    })

    it('logs changes under "nonVisibleDocument" when in non-visible documents', () => {
        // Remove testDocument from visible editors
        mockVisibleTextEditors = []
        onDidChangeVisibleTextEditors(mockVisibleTextEditors)

        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        // Change is logged under 'nonVisibleDocument'
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCounters({
                nonVisibleDocument_inserted: 3,
                nonVisibleDocument_deleted: 0,
            }),
        })
    })

    it('logs changes under "inactiveSelection" when there has been no recent cursor movement', () => {
        // Simulate last selection happened 6 seconds ago
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        vi.advanceTimersByTime(6000)

        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL - 6000)

        // Change is logged under 'inactiveSelection'
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCounters({
                inactiveSelection_inserted: 3,
                inactiveSelection_deleted: 0,
            }),
        })
    })

    it('logs undo and redo changes under their respective types', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        const textDocumentChangeReason = {
            undo: 1,
            redo: 2,
        }

        // Simulate undo change
        onDidChangeTextDocument(
            createChange({
                text: '',
                range: range(0, 3, 0, 0),
                rangeLength: 3,
                document: testDocument,
                reason: textDocumentChangeReason.undo,
            })
        )

        // Simulate redo change
        onDidChangeTextDocument(
            createChange({
                text: 'foo',
                range: range(0, 0, 0, 0),
                rangeLength: 0,
                document: testDocument,
                reason: textDocumentChangeReason.redo,
            })
        )

        vi.advanceTimersByTime(LOG_INTERVAL)

        // Changes are logged under 'undo' and 'redo'
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCounters({
                undo_inserted: 0,
                undo_deleted: 3,
                redo_inserted: 3,
                redo_deleted: 0,
            }),
        })
    })

    it('logs rapid, large changes under "rapidLargeChange"', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)

        // Simulate large change (e.g., 2000 characters inserted)
        const largeText = 'a'.repeat(2000)
        onDidChangeTextDocument(
            createChange({ text: largeText, range: range(0, 0, 0, 0), rangeLength: 0 })
        )

        vi.advanceTimersByTime(LOG_INTERVAL)

        // Change is logged under 'rapidLargeChange'
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCounters({
                rapidLargeChange_inserted: 2000,
                rapidLargeChange_deleted: 0,
            }),
        })
    })

    it('counts large changes as "normal" if they are not rapid', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)

        // Simulate large change after some time has passed
        vi.advanceTimersByTime(2000) // Advance time beyond LARGE_CHANGE_TIMEOUT
        const largeText = 'a'.repeat(2000)
        onDidChangeTextDocument(
            createChange({ text: largeText, range: range(0, 0, 0, 0), rangeLength: 0 })
        )

        vi.advanceTimersByTime(LOG_INTERVAL - 2000)

        // The large change is logged under 'normal'
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCounters({
                normal_inserted: 2000,
                normal_deleted: 0,
            }),
        })
    })

    it('resets counter after flushing', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCounters({
                normal_inserted: 3,
                normal_deleted: 0,
            }),
        })

        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'bar', range: range(0, 3, 0, 3), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledTimes(2)
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCounters({
                normal_inserted: 3,
                normal_deleted: 0,
            }),
        })
    })

    it('logs user typing under "normal" after cursor movement', () => {
        // Simulate user moving the cursor
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)

        // Simulate user typing
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        // Changes are logged under 'normal'
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCounters({
                normal_inserted: 3,
                normal_deleted: 0,
            }),
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

        // Changes in both documents should be counted under 'normal'
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCounters({
                normal_inserted: 6,
                normal_deleted: 0,
            }),
        })
    })
})
