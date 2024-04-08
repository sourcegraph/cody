import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { range } from '../../testutils/textDocument'

import { PersistenceTracker } from '.'
import { document } from '../../completions/test-helpers'

const insertionId = '123'

const getDocumentRange = (document: vscode.TextDocument): vscode.Range => {
    const firstLine = document.lineAt(0)
    const lastLine = document.lineAt(document.lineCount - 1)
    return new vscode.Range(firstLine.range.start, lastLine.range.end)
}

describe('PersistenceTracker', () => {
    const onPresentSpy = vi.fn()
    const onRemoveSpy = vi.fn()
    let tracker: PersistenceTracker

    // Mock workspace APIs to trigger document changes
    let onDidChangeTextDocument: (event: vscode.TextDocumentChangeEvent) => void
    let onDidRenameFiles: (event: vscode.FileRenameEvent) => void
    let onDidDeleteFiles: (event: vscode.FileDeleteEvent) => void
    beforeEach(() => {
        vi.useFakeTimers()

        tracker = new PersistenceTracker(
            {
                onDidChangeTextDocument(listener) {
                    onDidChangeTextDocument = listener
                    return { dispose: () => {} }
                },
                onDidRenameFiles(listener) {
                    onDidRenameFiles = listener
                    return { dispose: () => {} }
                },
                onDidDeleteFiles(listener) {
                    onDidDeleteFiles = listener
                    return { dispose: () => {} }
                },
            },
            { onPresent: onPresentSpy, onRemoved: onRemoveSpy }
        )
    })
    afterEach(() => {
        onPresentSpy.mockReset()
        onRemoveSpy.mockReset()
        tracker.dispose()
    })

    it('tracks completions over time when there are no document changes', () => {
        // This document is in the state _after_ the completion was inserted
        const doc = document('foo')

        tracker.track({
            id: insertionId,
            insertedAt: Date.now(),
            insertText: 'foo',
            insertRange: getDocumentRange(doc),
            document: doc,
        })

        const sharedArgs = {
            id: '123',
            charCount: 3,
            difference: 0,
            lineCount: 1,
        }

        vi.advanceTimersByTime(30 * 1000)
        expect(onPresentSpy).toHaveBeenCalledWith({
            ...sharedArgs,
            afterSec: 30,
        })
        expect(onRemoveSpy).not.toHaveBeenCalled()

        vi.advanceTimersByTime(90 * 1000)
        expect(onPresentSpy).toHaveBeenCalledWith({
            ...sharedArgs,
            afterSec: 120,
        })
        expect(onRemoveSpy).not.toHaveBeenCalled()

        vi.advanceTimersByTime(3 * 60 * 1000)
        expect(onPresentSpy).toHaveBeenCalledWith({
            ...sharedArgs,
            afterSec: 300,
        })
        expect(onRemoveSpy).not.toHaveBeenCalled()

        vi.advanceTimersByTime(5 * 60 * 1000)
        expect(onPresentSpy).toHaveBeenCalledWith({
            ...sharedArgs,
            afterSec: 600,
        })
        expect(onRemoveSpy).not.toHaveBeenCalled()
    })

    it('tracks changes to the document', () => {
        // This document is in the state _after_ the completion was inserted
        const doc = document('foo')

        tracker.track({
            id: insertionId,
            insertedAt: Date.now(),
            insertText: 'foo',
            insertRange: getDocumentRange(doc),
            document: doc,
        })

        const sharedArgs = {
            id: '123',
            charCount: 3,
            lineCount: 1,
        }

        vi.advanceTimersToNextTimer()
        expect(onPresentSpy).toHaveBeenCalledWith({
            ...sharedArgs,
            afterSec: 30,
            difference: 0,
        })
        expect(onRemoveSpy).not.toHaveBeenCalled()

        vi.spyOn(doc, 'getText').mockImplementationOnce(() => 'fo0')
        onDidChangeTextDocument({
            document: doc,
            contentChanges: [
                {
                    range: range(0, 2, 0, 3),
                    text: '0',
                    rangeLength: 0,
                    rangeOffset: 0,
                },
            ],
            reason: undefined,
        })

        vi.advanceTimersToNextTimer()
        expect(onPresentSpy).toHaveBeenCalledWith({
            ...sharedArgs,
            afterSec: 120,
            difference: 1 / 3,
        })
        expect(onRemoveSpy).not.toHaveBeenCalled()
    })

    it('tracks changes after renaming a document', () => {
        // This document is in the state _after_ the completion was inserted
        const doc = document('foo')

        tracker.track({
            id: insertionId,
            insertedAt: Date.now(),
            insertText: 'foo',
            insertRange: getDocumentRange(doc),
            document: doc,
        })

        const renamedDoc = document('fo0', 'typescript', 'file:///test2.ts')
        onDidRenameFiles({
            files: [
                {
                    oldUri: doc.uri,
                    newUri: renamedDoc.uri,
                },
            ],
        })

        vi.spyOn(doc, 'getText').mockImplementationOnce(() => 'fo0')
        onDidChangeTextDocument({
            document: renamedDoc,
            contentChanges: [
                {
                    range: range(0, 2, 0, 3),
                    text: '0',
                    rangeLength: 0,
                    rangeOffset: 0,
                },
            ],
            reason: undefined,
        })

        vi.advanceTimersToNextTimer()
        expect(onPresentSpy).toHaveBeenCalledWith({
            afterSec: 30,
            charCount: 3,
            difference: 1 / 3,
            id: '123',
            lineCount: 1,
        })
        expect(onRemoveSpy).not.toHaveBeenCalled()
    })

    it('gracefully handles file deletions', () => {
        // This document is in the state _after_ the completion was inserted
        const doc = document('foo')

        tracker.track({
            id: insertionId,
            insertedAt: Date.now(),
            insertText: 'foo',
            insertRange: getDocumentRange(doc),
            document: doc,
        })

        onDidDeleteFiles({ files: [doc.uri] })

        vi.advanceTimersToNextTimer()
        expect(onPresentSpy).not.toHaveBeenCalled()
        expect(onRemoveSpy).not.toHaveBeenCalled()
    })

    it('tracks the deletion of a range', () => {
        // This document is in the state _after_ the completion was inserted
        const doc = document('')

        tracker.track({
            id: insertionId,
            insertedAt: Date.now(),
            insertText: 'foo',
            insertRange: getDocumentRange(doc),
            document: doc,
        })

        vi.advanceTimersToNextTimer()
        expect(onRemoveSpy).toHaveBeenCalledWith({
            id: '123',
            difference: 1,
        })
        expect(onPresentSpy).not.toHaveBeenCalled()
    })
})
