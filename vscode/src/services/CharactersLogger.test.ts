import type { Writable } from 'type-fest'
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { telemetryRecorder } from '@sourcegraph/cody-shared'

import { document } from '../completions/test-helpers'
import { range } from '../editor/utils/virtual-text-document'

import {
    type CharacterLoggerCounters,
    CharactersLogger,
    DEFAULT_COUNTERS,
    LOG_INTERVAL,
    RAPID_CHANGE_TIMEOUT,
    SELECTION_TIMEOUT,
} from './CharactersLogger'
import * as codeBlockUtils from './utils/codeblock-action-tracker'

const testDocument = document('foo')

describe('CharactersLogger', () => {
    let recordSpy: MockInstance
    let tracker: CharactersLogger

    let onDidChangeActiveTextEditor: (event: vscode.TextEditor | undefined) => void
    let onDidChangeTextDocument: (event: vscode.TextDocumentChangeEvent) => Promise<void>
    let onDidCloseTextDocument: (document: vscode.TextDocument) => void
    let onDidChangeWindowState: (state: vscode.WindowState) => void
    let onDidChangeTextEditorSelection: (event: vscode.TextEditorSelectionChangeEvent) => void

    let mockWindowState: Writable<vscode.WindowState>
    let mockActiveTextEditor: Writable<vscode.TextEditor> | undefined
    let mockTextEditorSelectionEvent: vscode.TextEditorSelectionChangeEvent

    // Helper functions to work with telemetry events
    function findCodyCharactersFlushEvent() {
        const event = recordSpy.mock.calls.find(
            call => call[0] === 'cody.characters' && call[1] === 'flush'
        )
        return event?.[2]
    }

    // Helper functions for PCW tests
    async function setupBasicCodeEnvironment() {
        // Set up the test environment
        onDidChangeActiveTextEditor(mockActiveTextEditor)
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)
        vi.resetAllMocks()

        // Human writes code
        const humanCode = 'function humanWrittenCode() {}'
        vi.spyOn(codeBlockUtils, 'isCodeFromChatCodeBlockAction').mockResolvedValueOnce(null)
        await onDidChangeTextDocument(
            createChange({ text: humanCode, range: range(0, 0, 0, 0), rangeLength: 0 })
        )

        // Cody writes code
        const codyCode = 'function codyGeneratedCode() {}'
        vi.spyOn(codeBlockUtils, 'isCodeFromChatCodeBlockAction').mockResolvedValueOnce({
        operation: 'insert',
        code: codyCode,
        lineCount: 1,
        charCount: codyCode.length,
        eventName: 'insert',
        source: 'chat',
        })

        await onDidChangeTextDocument(
        createChange({ text: codyCode, range: range(1, 0, 1, 0), rangeLength: 0 })
        )

        // Advance time to trigger the flush
        vi.advanceTimersByTime(LOG_INTERVAL)

        return { humanCode, codyCode }
    }

    function calculateHumanInsertions(flushEvent: any): number {
        // Get total human insertions across all specific categories from the telemetry event
        // Include stale categories in our calculation to properly count all human edits
        return [
            // All rapid change categories
            flushEvent.metadata.rapid_m_change_inserted || 0,
            flushEvent.metadata.rapid_s_change_inserted || 0,
            flushEvent.metadata.rapid_xs_change_inserted || 0,
            flushEvent.metadata.rapid_xxs_change_inserted || 0,
            flushEvent.metadata.rapid_xxxs_change_inserted || 0,
            // All regular change categories
            flushEvent.metadata.m_change_inserted || 0,
            flushEvent.metadata.s_change_inserted || 0,
            flushEvent.metadata.xs_change_inserted || 0,
            flushEvent.metadata.xxs_change_inserted || 0,
            flushEvent.metadata.xxxs_change_inserted || 0,
            // Stale changes (including the second edit)
            flushEvent.metadata.stale_xs_change_inserted || 0,
            flushEvent.metadata.stale_xxs_change_inserted || 0,
            flushEvent.metadata.stale_s_change_inserted || 0,
            // Unexpected changes
            flushEvent.metadata.unexpected_inserted || 0,
        ].reduce((sum, value) => sum + value, 0)
    }

    function calculatePCW(
        codyInsertions: number,
        codyDeletions: number,
        humanInsertions: number
    ): number {
        // PCW = (Cody code written - Cody code removed) / Total code written
        const codyNetContribution = codyInsertions - codyDeletions
        const totalCodeWritten = humanInsertions + codyInsertions

        // Avoid division by zero and ensure PCW is calculated correctly
        return totalCodeWritten > 0 ? codyNetContribution / totalCodeWritten : 0
    }

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

    it('should handle insertions, deletions, rapid and stale changes, and changes outside of visible range', async () => {
        // Simulate user typing in the active text editor
        onDidChangeActiveTextEditor(mockActiveTextEditor)
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)

        // Scenario 1: User types 'hello' (insertion)
        await onDidChangeTextDocument(
            createChange({ text: 'hello', range: range(0, 0, 0, 0), rangeLength: 0 })
        )

        // Advance time less than RAPID_CHANGE_TIMEOUT to simulate rapid change
        vi.advanceTimersByTime(RAPID_CHANGE_TIMEOUT - 5)

        // Scenario 2: User deletes 'he' (deletion)
        await onDidChangeTextDocument(
            createChange({ text: '', range: range(0, 0, 0, 2), rangeLength: 2 })
        )

        // Now, advance time beyond SELECTION_TIMEOUT to make selection stale
        vi.advanceTimersByTime(SELECTION_TIMEOUT + 1000)

        // Scenario 3: User types 'there' (stale insertion)
        await onDidChangeTextDocument(
            createChange({ text: 'there', range: range(0, 3, 0, 3), rangeLength: 0 })
        )
        // Should be counted as an insertion, stale change

        // Scenario 4: Change outside of visible range
        // Simulate that the change is outside the visible range
        mockActiveTextEditor!.visibleRanges = [range(1, 0, 1, 0)] // Lines 1 to 1 (empty range)
        onDidChangeActiveTextEditor(mockActiveTextEditor)

        // User types 'hidden' at line 50 (outside visible range)
        await onDidChangeTextDocument(
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

                partially_outside_of_visible_ranges: 1,
                partially_outside_of_visible_ranges_inserted: 6, // 'hidden'
            }),
        })
    })

    it('should handle undo, redo, window not focused, no active editor, outside of active editor, and document closing', async () => {
        onDidChangeActiveTextEditor(mockActiveTextEditor)
        onDidChangeTextEditorSelection(mockTextEditorSelectionEvent)

        const changeReasons = { Undo: 1, Redo: 2 } as const

        const xxsChangeEvent = createChange({ text: 'test', range: range(0, 0, 0, 0), rangeLength: 0 })
        await onDidChangeTextDocument(xxsChangeEvent)

        const disjointChange = createChange({ text: 'test', range: range(2, 0, 0, 0), rangeLength: 0 })
        await onDidChangeTextDocument({
            ...xxsChangeEvent,
            contentChanges: [xxsChangeEvent.contentChanges[0], disjointChange.contentChanges[0]],
        })

        // Simulate undo
        await onDidChangeTextDocument(
            createChange({
                text: '',
                range: range(0, 4, 0, 0),
                rangeLength: 4,
                reason: changeReasons.Undo,
            })
        )

        // Simulate redo
        await onDidChangeTextDocument(
            createChange({
                text: 'test',
                range: range(0, 0, 0, 0),
                rangeLength: 0,
                reason: changeReasons.Redo,
            })
        )

        const codeFromChat = 'insert_from_chat'
        vi.spyOn(codeBlockUtils, 'isCodeFromChatCodeBlockAction').mockResolvedValueOnce({
            operation: 'insert',
            code: codeFromChat,
            lineCount: 1,
            charCount: codeFromChat.length,
            eventName: 'insert',
            source: 'chat',
        })

        await onDidChangeTextDocument(
            createChange({
                text: codeFromChat,
                range: range(0, 0, 0, 0),
                rangeLength: 0,
            })
        )

        mockWindowState.focused = false
        onDidChangeWindowState(mockWindowState)

        // User types ' window not focused' when window not focused
        await onDidChangeTextDocument(
            createChange({ text: 'window not focused', range: range(0, 4, 0, 4), rangeLength: 0 })
        )

        // Simulate window gaining focus
        mockWindowState.focused = true
        onDidChangeWindowState(mockWindowState)

        // Simulate no active editor
        onDidChangeActiveTextEditor(undefined)
        await onDidChangeTextDocument(
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
        await onDidChangeTextDocument(
            createChange({
                text: 'outside active editor',
                range: range(0, 21, 0, 21),
                rangeLength: 0,
                document: testDocument,
            })
        )

        onDidCloseTextDocument(testDocument)
        await onDidChangeTextDocument(
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
                cody_chat: 1,
                cody_chat_inserted: 16, // 'insert_from_chat'

                xxs_change: 1,
                xxs_change_inserted: 4, // 'test'

                disjoint_change: 1,
                disjoint_change_inserted: 8, // 'test' + 'test'

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

    it('should calculate baseline PCW correctly', async () => {
        // Set up basic environment with human and Cody code
        await setupBasicCodeEnvironment()

        // Add one more human edit
        const moreHumanCode = 'const x = 42;'
        vi.spyOn(codeBlockUtils, 'isCodeFromChatCodeBlockAction').mockResolvedValueOnce(null)
        await onDidChangeTextDocument(
            createChange({ text: moreHumanCode, range: range(2, 0, 2, 0), rangeLength: 0 })
        )

        // Flush the log again to include the additional human code
        vi.advanceTimersByTime(LOG_INTERVAL)

        // Verify the telemetry event was recorded
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', expect.anything())
        const flushEvent = findCodyCharactersFlushEvent()

        // Verify some human code was tracked in at least one category
        const hasHumanCode = Object.entries(flushEvent.metadata).some(([key, value]) => {
            return (
                (key.includes('_change') || key.includes('rapid_')) &&
                !key.includes('cody_') &&
                typeof value === 'number' &&
                value > 0
            )
        })
        expect(hasHumanCode).toBe(true)

        // Check by combining ALL telemetry flush events
        const allFlushEvents = recordSpy.mock.calls
            .filter(call => call[0] === 'cody.characters' && call[1] === 'flush')
        .map(call => call[2])

        // Calculate totals across all events
        let totalHumanInsertions = 0;
        let totalCodyInsertions = 0;

        // Calculate the combined total of human and Cody contributions across all events
        for (const event of allFlushEvents) {
            const humanInserts = calculateHumanInsertions(event)
            const codyInserts = event.metadata.cody_chat_inserted || 0

            totalHumanInsertions += humanInserts;
            totalCodyInsertions += codyInserts;
        }

        // Calculate true PCW using all events
        const PCW = totalCodyInsertions / (totalHumanInsertions + totalCodyInsertions);

        // The PCW considering all events should be 31/74(31cody+43human) ≈ 0.419
        expect(PCW).toBeCloseTo(31/74, 3)
    })

    it('should update PCW correctly when human deletes Cody-generated code', async () => {
        // Set up basic environment with human and Cody code
        await setupBasicCodeEnvironment()
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', expect.anything())
        const telemetryEvent = findCodyCharactersFlushEvent()

        // Capture initial metrics
        const humanInsertions = calculateHumanInsertions(telemetryEvent)
        const initialCodyInsertions = telemetryEvent.metadata.cody_chat_inserted
        const initialPcw = calculatePCW(initialCodyInsertions, 0, humanInsertions)

        // Reset for testing deletion
        recordSpy.mockClear()

        const humanDeletedCodyCode = 10 // 10 chars will be deleted
        vi.spyOn(codeBlockUtils, 'isCodeFromChatCodeBlockAction').mockResolvedValueOnce(null)
        await onDidChangeTextDocument(
            createChange({
                text: '',
                range: range(1, 0, 1, humanDeletedCodyCode),
                rangeLength: humanDeletedCodyCode,
            })
        )

        vi.advanceTimersByTime(LOG_INTERVAL)

        // Verify deletion is tracked in telemetry
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', expect.anything())
        const deleteEventPayload = findCodyCharactersFlushEvent()

        // Sum up all deleted character counts across all categories
        const totalDeleted = Object.entries(deleteEventPayload.metadata)
            .filter(([key]) => key.endsWith('_deleted'))
            .reduce((sum, [_, value]) => sum + (value as number), 0)

        // Verify we recorded the 10 deleted characters somewhere
        expect(totalDeleted).toBe(humanDeletedCodyCode)

        // Calculate updated PCW after human deletion of Cody code
        const updatedCodyNetContribution = initialCodyInsertions - totalDeleted
        const updatedTotalCodeWritten = humanInsertions + initialCodyInsertions - totalDeleted
        const updatedPcw = updatedCodyNetContribution / updatedTotalCodeWritten

        // The PCW should be decreased since human deleted Cody's code
        expect(updatedPcw).toBeLessThan(initialPcw)

        // expect PCW with specific value
        expect(updatedPcw).toBeCloseTo(updatedCodyNetContribution / updatedTotalCodeWritten, 3)
    })

    it('should update PCW correctly when Cody deletes its own code', async () => {
        // Set up basic environment with human and Cody code
        await setupBasicCodeEnvironment()
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', expect.anything())
        const telemetryEvent = findCodyCharactersFlushEvent()

        // Capture initial metrics
        const humanInsertions = calculateHumanInsertions(telemetryEvent)
        const initialCodyInsertions = telemetryEvent.metadata.cody_chat_inserted
        const initialPcw = calculatePCW(initialCodyInsertions, 0, humanInsertions)

        // Reset for testing Cody's self-deletion
        recordSpy.mockClear()

        // Simulate Cody deleting some of its own code
        const codySelfDeletion = 15 // Cody deletes 15 characters of its own code

        // Mock the document change type classifier to attribute the deletion to Cody
        const getDocumentChangeTypeSpy = vi.spyOn(tracker, 'getDocumentChangeType' as any)
        getDocumentChangeTypeSpy.mockImplementationOnce(() => 'cody_chat')

        // Simulate Cody deleting its own code through the normal event flow
        await onDidChangeTextDocument(
            createChange({
                text: '',
                range: range(1, 0, 1, codySelfDeletion),
                rangeLength: codySelfDeletion,
            })
        )

        vi.advanceTimersByTime(LOG_INTERVAL)

        // Verify Cody's self-deletion is tracked in telemetry
        expect(recordSpy).toHaveBeenCalledWith('cody.characters', 'flush', expect.anything())
        const codySelfDeletionPayload = findCodyCharactersFlushEvent()

        // Verify cody_chat_deleted is populated with correct deletion count
        expect(codySelfDeletionPayload.metadata.cody_chat_deleted).toBe(codySelfDeletion)

        // Get values from telemetry
        const finalCodyInsertions =
            codySelfDeletionPayload.metadata.cody_chat_inserted || initialCodyInsertions
        const finalCodyDeletions = codySelfDeletionPayload.metadata.cody_chat_deleted

        // Calculate PCW after Cody's self-deletion
        const finalPcw = calculatePCW(finalCodyInsertions, finalCodyDeletions, humanInsertions)

        // PCW should be decreased after Cody deletes its own code
        expect(finalPcw).toBeLessThan(initialPcw)

        // expect PCW with specific value - using the finalPcw formula directly
        const calculatedPcw = (finalCodyInsertions - finalCodyDeletions) / (humanInsertions + finalCodyInsertions)
        expect(finalPcw).toBeCloseTo(calculatedPcw, 3)
    })
})
