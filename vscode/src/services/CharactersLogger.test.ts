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
    changeBoundaries,
} from './CharactersLogger'

const testDocument = document('foo')

describe('CharactersLogger', () => {
    let recordSpy: MockInstance
    let tracker: CharactersLogger

    let onDidChangeActiveTextEditor: (event: vscode.TextEditor | undefined) => void
    let onDidChangeTextEditorVisibleRanges: (event: vscode.TextEditorVisibleRangesChangeEvent) => void
    let onDidChangeTextDocument: (event: vscode.TextDocumentChangeEvent) => void
    let onDidCloseTextDocument: (document: vscode.TextDocument) => void
    let onDidChangeWindowState: (state: vscode.WindowState) => void
    let onDidChangeVisibleTextEditors: (editors: vscode.TextEditor[]) => void
    let onDidChangeTextEditorSelection: (event: vscode.TextEditorSelectionChangeEvent) => void

    let mockWindowState: Writable<vscode.WindowState>
    let mockVisibleTextEditors: vscode.TextEditor[]
    let mockTextEditorSelectionEvent: vscode.TextEditorSelectionChangeEvent

    beforeEach(() => {
        vi.useFakeTimers()

        recordSpy = vi.spyOn(telemetryRecorder, 'recordEvent')

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
                onDidCloseTextDocument(listener) {
                    onDidCloseTextDocument = listener
                    return { dispose: () => {} }
                },
            },
            {
                activeTextEditor: {} as any,
                onDidChangeTextEditorVisibleRanges(listener) {
                    onDidChangeTextEditorVisibleRanges = listener
                    return { dispose: () => {} }
                },
                onDidChangeActiveTextEditor(listener) {
                    onDidChangeActiveTextEditor = listener
                    return { dispose: () => {} }
                },
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
        console.log({ onDidChangeActiveTextEditor, onDidChangeTextEditorVisibleRanges })
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
    function expectedCharCounters(expected: Partial<CharacterLoggerCounters>): Record<string, number> {
        return { ...DEFAULT_COUNTERS, ...expected }
    }

    function advanceTimerToPreventRapidChange() {
        vi.advanceTimersByTime(RAPID_CHANGE_TIMEOUT + 1)
    }

    it('logs inserted and deleted characters for user edits', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        advanceTimerToPreventRapidChange()

        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'bar', range: range(0, 3, 0, 3), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'char-counts', {
            metadata: expectedCharCounters({
                xxs_change_inserted: 6, // 'foo' + 'bar'
            }),
        })
    })

    it('logs changes under "window_not_focused" when window is not focused', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        mockWindowState.focused = false
        onDidChangeWindowState(mockWindowState)

        advanceTimerToPreventRapidChange()

        onDidChangeTextDocument(createChange({ text: 'bar', range: range(0, 3, 0, 3), rangeLength: 0 }))
        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenNthCalledWith(1, 'cody.characters', 'char-counts', {
            metadata: expectedCharCounters({
                xxs_change_inserted: 3, // 'foo'
                window_not_focused_inserted: 3, // 'bar'
            }),
        })
    })

    it.only('logs changes under "non_visible_document" when in non-visible documents', () => {
        // Remove testDocument from visible editors
        mockVisibleTextEditors = []
        onDidChangeVisibleTextEditors(mockVisibleTextEditors)

        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        // Verify that changes are logged under 'non_visible_document'
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                non_visible_document_inserted: 3,
                non_visible_document_deleted: 0,
            }),
        })
    })

    it('logs changes under "stale_selection" when there has been no recent cursor movement', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        vi.advanceTimersByTime(SELECTION_TIMEOUT + 1)

        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))
        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                stale_selection_inserted: 3,
                stale_selection_deleted: 0,
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

        advanceTimerToPreventRapidChange()

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

        // Verify that changes are logged under 'undo' and 'redo'
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                undo_inserted: 0,
                undo_deleted: 3,
                redo_inserted: 3,
                redo_deleted: 0,
            }),
        })
    })

    it('logs rapid changes under "rapid_change"', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        vi.advanceTimersByTime(RAPID_CHANGE_TIMEOUT / 2)

        // Simulate second change within rapid change timeout
        onDidChangeTextDocument(createChange({ text: 'bar', range: range(0, 3, 0, 3), rangeLength: 0 }))
        vi.advanceTimersByTime(LOG_INTERVAL)

        // TODO: both changes should be logged as rapid.
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                rapid_change_inserted: 3,
                rapid_change_deleted: 0,
                xs_change_inserted: 3,
                xs_change_deleted: 0,
            }),
        })
    })

    it('counts large changes according to their sizes if they are not rapid', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)

        advanceTimerToPreventRapidChange()
        const largeText = 'a'.repeat(1005)
        onDidChangeTextDocument(
            createChange({ text: largeText, range: range(0, 0, 0, 0), rangeLength: 0 })
        )

        vi.advanceTimersByTime(LOG_INTERVAL)

        // Verify that the large change is logged under 'xxl_change'
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                xxl_change_inserted: 1005,
                xxl_change_deleted: 0,
            }),
        })
    })

    it('resets counter after flushing', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                xs_change_inserted: 3,
                xs_change_deleted: 0,
            }),
        })

        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        advanceTimerToPreventRapidChange()
        onDidChangeTextDocument(createChange({ text: 'bar', range: range(0, 3, 0, 3), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledTimes(2)
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                xs_change_inserted: 3,
                xs_change_deleted: 0,
            }),
        })
    })

    it('logs user typing under size-based change types after cursor movement', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(
            createChange({ text: 'abcde', range: range(0, 0, 0, 0), rangeLength: 0 })
        )

        vi.advanceTimersByTime(LOG_INTERVAL)

        // 'abcde' is 5 characters, which falls under 'xs_change' (2-5)
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                xs_change_inserted: 5,
                xs_change_deleted: 0,
            }),
        })
    })

    it('handles multiple documents and selections', () => {
        const anotherDocument = document('bar')
        mockVisibleTextEditors.push({
            document: anotherDocument,
        } as vscode.TextEditor)
        onDidChangeVisibleTextEditors(mockVisibleTextEditors)

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

        onDidChangeTextDocument(
            createChange({
                text: 'foo',
                range: range(0, 0, 0, 0),
                rangeLength: 0,
                document: testDocument,
            })
        )

        advanceTimerToPreventRapidChange()

        onDidChangeTextDocument(
            createChange({
                text: 'baz',
                range: range(0, 0, 0, 0),
                rangeLength: 0,
                document: anotherDocument,
            })
        )

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                xs_change_inserted: 6, // 'foo' + 'baz'
                xs_change_deleted: 0,
            }),
        })
    })

    it('removes document from tracking on close', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'foo', range: range(0, 0, 0, 0), rangeLength: 0 }))

        onDidCloseTextDocument(testDocument)

        onDidChangeTextDocument(createChange({ text: 'bar', range: range(0, 3, 0, 3), rangeLength: 0 }))
        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                xs_change_inserted: 3, // Only 'foo' is counted
                xs_change_deleted: 0,
                non_visible_document_inserted: 3,
            }),
        })
    })

    it('correctly classifies changes at boundary sizes', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)

        for (const [_, boundaries] of Object.entries(changeBoundaries)) {
            advanceTimerToPreventRapidChange()
            const text = 'a'.repeat(boundaries.min || boundaries.max)
            onDidChangeTextDocument(createChange({ text, range: range(0, 0, 0, 0), rangeLength: 0 }))
        }

        vi.advanceTimersByTime(LOG_INTERVAL)

        const expected: any = {}
        for (const [type, boundary] of Object.entries(changeBoundaries)) {
            expected[`${type}_inserted`] = boundary.min || boundary.max
            expected[`${type}_deleted`] = 0
        }

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters(expected),
        })
    })

    it('handles a mix of different change sizes in one interval', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(createChange({ text: 'abc', range: range(0, 0, 0, 0), rangeLength: 0 }))

        advanceTimerToPreventRapidChange()

        // Simulate a medium change of 30 characters
        const mediumText = 'a'.repeat(30)
        onDidChangeTextDocument(
            createChange({ text: mediumText, range: range(0, 3, 0, 3), rangeLength: 0 })
        )

        advanceTimerToPreventRapidChange()

        const largeText = 'b'.repeat(60)
        onDidChangeTextDocument(
            createChange({ text: largeText, range: range(0, 33, 0, 33), rangeLength: 0 })
        )

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                xs_change_inserted: 3, // 'abc'
                m_change_inserted: 30, // 30 'a's
                l_change_inserted: 60, // 60 'b's
                xs_change_deleted: 0,
                m_change_deleted: 0,
                l_change_deleted: 0,
            }),
        })
    })

    it('prioritizes rapid changes over size-based classification', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(
            createChange({ text: 'hello', range: range(0, 0, 0, 0), rangeLength: 0 })
        )

        vi.advanceTimersByTime(RAPID_CHANGE_TIMEOUT - 10)
        onDidChangeTextDocument(
            createChange({ text: 'world', range: range(0, 5, 0, 5), rangeLength: 0 })
        )

        advanceTimerToPreventRapidChange()

        const text = 'a'.repeat(10)
        onDidChangeTextDocument(createChange({ text, range: range(0, 10, 0, 10), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        // 'hello' and 'world' should be counted under 'rapid_change'
        // The last change should be counted under 's_change' (size 10)
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                rapid_change_inserted: 5, // 'world'
                xs_change_inserted: 5, // 'hello'
                s_change_inserted: 10, // 10 'a's
            }),
        })
    })

    it('handles window focus loss and regain within an interval', () => {
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        onDidChangeTextDocument(
            createChange({ text: 'focus', range: range(0, 0, 0, 0), rangeLength: 0 })
        )

        mockWindowState.focused = false
        onDidChangeWindowState(mockWindowState)

        advanceTimerToPreventRapidChange()
        onDidChangeTextDocument(createChange({ text: 'blur', range: range(0, 5, 0, 5), rangeLength: 0 }))

        mockWindowState.focused = true
        onDidChangeWindowState(mockWindowState)
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)

        advanceTimerToPreventRapidChange()
        onDidChangeTextDocument(createChange({ text: 'gain', range: range(0, 9, 0, 9), rangeLength: 0 }))

        vi.advanceTimersByTime(LOG_INTERVAL)

        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', {
            metadata: expectedCharCounters({
                window_not_focused_inserted: 4, // 'blur'
                xs_change_inserted: 4 + 5, // 'gain' (after regaining focus)
                xs_change_deleted: 0,
                window_not_focused_deleted: 0,
            }),
        })
    })
})
