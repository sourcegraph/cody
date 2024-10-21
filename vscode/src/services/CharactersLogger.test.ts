import type { Writable } from 'type-fest'
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { telemetryRecorder } from '@sourcegraph/cody-shared'

import { document } from '../completions/test-helpers'
import { range } from '../testutils/textDocument'

import {
    type CharacterLoggerCounters,
    CharactersLogger,
    DEFAULT_COUNTERS,
    LOG_INTERVAL,
    RAPID_CHANGE_TIMEOUT,
    SELECTION_TIMEOUT,
} from './CharactersLogger'

const testDocument = document('foo')

describe('CharactersLogger', () => {
    let recordSpy: MockInstance
    let tracker: CharactersLogger

    let onDidChangeActiveTextEditor: (event: vscode.TextEditor | undefined) => void
    let onDidChangeTextDocument: (event: vscode.TextDocumentChangeEvent) => void
    let onDidCloseTextDocument: (document: vscode.TextDocument) => void
    let onDidChangeWindowState: (state: vscode.WindowState) => void
    let onDidChangeTextEditorSelection: (event: vscode.TextEditorSelectionChangeEvent) => void

    let mockWindowState: Writable<vscode.WindowState>
    let mockActiveTextEditor: Writable<vscode.TextEditor> | undefined
    let mockTextEditorSelectionEvent: vscode.TextEditorSelectionChangeEvent

    beforeEach(() => {
        vi.useFakeTimers()

        recordSpy = vi.spyOn(telemetryRecorder, 'recordEvent')

        mockWindowState = { focused: true }
        mockActiveTextEditor = {
            document: testDocument,
            visibleRanges: [range(0, 0, 1000, 1000)],
        } as unknown as vscode.TextEditor

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
                onDidCloseTextDocument(listener) {
                    onDidCloseTextDocument = listener
                    return { dispose: () => {} }
                },
            },
            {
                state: mockWindowState,
                activeTextEditor: mockActiveTextEditor,
                onDidChangeWindowState(listener) {
                    onDidChangeWindowState = listener
                    return { dispose: () => {} }
                },
                onDidChangeActiveTextEditor(listener) {
                    onDidChangeActiveTextEditor = listener
                    return { dispose: () => {} }
                },
                onDidChangeTextEditorSelection(listener) {
                    onDidChangeTextEditorSelection = listener
                    return { dispose: () => {} }
                },
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

    // Helper function to create expected counters
    function expectedCharCounters(expected: Partial<CharacterLoggerCounters>): Record<string, number> {
        return { ...DEFAULT_COUNTERS, ...expected }
    }

    it('should handle insertions, deletions, rapid and stale changes, and changes outside of visible range', () => {
        // Simulate user typing in the active text editor
        onDidChangeActiveTextEditor(mockActiveTextEditor)
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)

        // Scenario 1: User types 'hello' (insertion)
        onDidChangeTextDocument(
            createChange({ text: 'hello', range: range(0, 0, 0, 0), rangeLength: 0 })
        )

        // Advance time less than RAPID_CHANGE_TIMEOUT to simulate rapid change
        vi.advanceTimersByTime(RAPID_CHANGE_TIMEOUT - 5)

        // Scenario 2: User deletes 'he' (deletion)
        onDidChangeTextDocument(createChange({ text: '', range: range(0, 0, 0, 2), rangeLength: 2 }))

        // Now, advance time beyond SELECTION_TIMEOUT to make selection stale
        vi.advanceTimersByTime(SELECTION_TIMEOUT + 1000)

        // Scenario 3: User types 'there' (stale insertion)
        onDidChangeTextDocument(
            createChange({ text: 'there', range: range(0, 3, 0, 3), rangeLength: 0 })
        )
        // Should be counted as an insertion, stale change

        // Scenario 4: Change outside of visible range
        // Simulate that the change is outside the visible range
        mockActiveTextEditor!.visibleRanges = [range(1, 0, 1, 0)] // Lines 1 to 1 (empty range)
        onDidChangeActiveTextEditor(mockActiveTextEditor)

        // User types 'hidden' at line 50 (outside visible range)
        onDidChangeTextDocument(
            createChange({
                text: 'hidden',
                range: range(50, 0, 50, 0), // Line 50, start
                rangeLength: 0,
            })
        )

        // Restore the visible ranges
        mockActiveTextEditor!.visibleRanges = [range(0, 0, 1000, 0)]

        // Flush the log
        vi.advanceTimersByTime(LOG_INTERVAL)

        // Expected counters:
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                xxs_change: 1,
                xxs_change_inserted: 5, // 'hello'

                rapid_xxxs_change: 1,
                rapid_xxxs_change_deleted: 2, // 'he'

                stale_xxs_change: 1,
                stale_xxs_change_inserted: 5, // 'there'

                outside_of_visible_ranges: 1,
                outside_of_visible_ranges_inserted: 6, // 'hidden'
            }),
        })
    })

    it('should handle undo, redo, window not focused, no active editor, outside of active editor, and document closing', () => {
        onDidChangeActiveTextEditor(mockActiveTextEditor)
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)

        const changeReasons = { Undo: 1, Redo: 2 } as const

        onDidChangeTextDocument(createChange({ text: 'test', range: range(0, 0, 0, 0), rangeLength: 0 }))

        // Simulate undo
        onDidChangeTextDocument(
            createChange({
                text: '',
                range: range(0, 4, 0, 0),
                rangeLength: 4,
                reason: changeReasons.Undo,
            })
        )

        // Simulate redo
        onDidChangeTextDocument(
            createChange({
                text: 'test',
                range: range(0, 0, 0, 0),
                rangeLength: 0,
                reason: changeReasons.Redo,
            })
        )

        mockWindowState.focused = false
        onDidChangeWindowState(mockWindowState)

        // User types ' window not focused' when window not focused
        onDidChangeTextDocument(
            createChange({ text: 'window not focused', range: range(0, 4, 0, 4), rangeLength: 0 })
        )

        // Simulate window gaining focus
        mockWindowState.focused = true
        onDidChangeWindowState(mockWindowState)

        // Simulate no active editor
        onDidChangeActiveTextEditor(undefined)
        onDidChangeTextDocument(
            createChange({ text: 'no active editor', range: range(0, 21, 0, 21), rangeLength: 0 })
        )

        // Simulate editor for different document
        const anotherDocument = {
            uri: { toString: () => 'file://anotherdocument' },
        } as vscode.TextDocument

        const anotherEditor = {
            document: anotherDocument,
            visibleRanges: [range(0, 0, 1000, 0)],
        } as unknown as vscode.TextEditor

        onDidChangeActiveTextEditor(anotherEditor)

        // User types in original document (not the active editor's document)
        onDidChangeTextDocument(
            createChange({
                text: 'outside active editor',
                range: range(0, 21, 0, 21),
                rangeLength: 0,
                document: testDocument,
            })
        )

        onDidCloseTextDocument(testDocument)
        onDidChangeTextDocument(
            createChange({
                text: '!',
                range: range(0, 50, 0, 50),
                rangeLength: 0,
                document: testDocument,
            })
        )

        vi.advanceTimersByTime(LOG_INTERVAL)

        // Expected counters:
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                xxs_change: 1,
                xxs_change_inserted: 4, // 'test'

                undo: 1,
                undo_deleted: 4, // 'test' deleted

                redo: 1,
                redo_inserted: 4, // 'test' re-inserted

                window_not_focused: 1,
                window_not_focused_inserted: 18, // ' window not focused'

                no_active_editor: 1,
                no_active_editor_inserted: 16, // 'no active editor'

                outside_of_active_editor: 2,
                outside_of_active_editor_inserted: 22, //'outside active editor'
            }),
        })
    })
})
