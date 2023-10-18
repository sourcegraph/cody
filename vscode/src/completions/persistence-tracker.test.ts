import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import type * as vscode from 'vscode'

import { telemetryService } from '../services/telemetry'
import { range } from '../testutils/textDocument'

import { CompletionID } from './logger'
import { PersistenceTracker } from './persistence-tracker'
import { document } from './test-helpers'

const completionId = '123' as CompletionID

describe('PersistenceTracker', () => {
    let logSpy: MockInstance
    let tracker: PersistenceTracker

    // Mock workspace APIs to trigger document changes
    let onDidChangeTextDocument: (event: vscode.TextDocumentChangeEvent) => void
    let onDidRenameFiles: (event: vscode.FileRenameEvent) => void
    let onDidDeleteFiles: (event: vscode.FileDeleteEvent) => void
    beforeEach(() => {
        vi.useFakeTimers()
        logSpy = vi.spyOn(telemetryService, 'log')
        tracker = new PersistenceTracker({
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
        })
    })
    afterEach(() => {
        tracker.dispose()
    })

    it('tracks completions over time when there are no document changes', () => {
        const completion = {
            insertText: 'foo',
            range: range(0, 0, 0, 0),
        }
        // This document is in the state _after_ the completion was inserted
        const doc = document('foo')

        tracker.track({ id: completionId, insertedAt: Date.now(), completion, document: doc })

        const sharedArgs = {
            id: '123',
            charCount: 3,
            difference: 0,
            lineCount: 1,
        }

        vi.advanceTimersByTime(30 * 1000)
        expect(logSpy).toHaveBeenCalledWith('CodyVSCodeExtension:completion:persistence:present', {
            ...sharedArgs,
            afterSec: 30,
        })

        vi.advanceTimersByTime(90 * 1000)
        expect(logSpy).toHaveBeenCalledWith('CodyVSCodeExtension:completion:persistence:present', {
            ...sharedArgs,
            afterSec: 120,
        })

        vi.advanceTimersByTime(3 * 60 * 1000)
        expect(logSpy).toHaveBeenCalledWith('CodyVSCodeExtension:completion:persistence:present', {
            ...sharedArgs,
            afterSec: 300,
        })

        vi.advanceTimersByTime(5 * 60 * 1000)
        expect(logSpy).toHaveBeenCalledWith('CodyVSCodeExtension:completion:persistence:present', {
            ...sharedArgs,
            afterSec: 600,
        })
    })

    it('tracks changes to the document', () => {
        const completion = {
            insertText: 'foo',
            range: range(0, 0, 0, 0),
        }
        // This document is in the state _after_ the completion was inserted
        const doc = document('foo')

        tracker.track({ id: completionId, insertedAt: Date.now(), completion, document: doc })

        const sharedArgs = {
            id: '123',
            charCount: 3,
            lineCount: 1,
        }

        vi.advanceTimersToNextTimer()
        expect(logSpy).toHaveBeenCalledWith('CodyVSCodeExtension:completion:persistence:present', {
            ...sharedArgs,
            afterSec: 30,
            difference: 0,
        })

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
        expect(logSpy).toHaveBeenCalledWith('CodyVSCodeExtension:completion:persistence:present', {
            ...sharedArgs,
            afterSec: 120,
            difference: 1 / 3,
        })
    })

    it('tracks changes after renaming a document', () => {
        const completion = {
            insertText: 'foo',
            range: range(0, 0, 0, 0),
        }
        // This document is in the state _after_ the completion was inserted
        const doc = document('foo')

        tracker.track({ id: completionId, insertedAt: Date.now(), completion, document: doc })

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
        expect(logSpy).toHaveBeenCalledWith('CodyVSCodeExtension:completion:persistence:present', {
            afterSec: 30,
            charCount: 3,
            difference: 1 / 3,
            id: '123',
            lineCount: 1,
        })
    })

    it('gracefully handles file deletions', () => {
        const completion = {
            insertText: 'foo',
            range: range(0, 0, 0, 0),
        }
        // This document is in the state _after_ the completion was inserted
        const doc = document('foo')

        tracker.track({ id: completionId, insertedAt: Date.now(), completion, document: doc })

        onDidDeleteFiles({ files: [doc.uri] })

        vi.advanceTimersToNextTimer()
        expect(logSpy).not.toHaveBeenCalled()
    })

    it('tracks the deletion of a range', () => {
        const completion = {
            insertText: 'foo',
            range: range(0, 0, 0, 0),
        }
        // This document is in the state _after_ the completion was inserted
        const doc = document('')

        tracker.track({ id: completionId, insertedAt: Date.now(), completion, document: doc })

        vi.advanceTimersToNextTimer()
        expect(logSpy).toHaveBeenCalledWith('CodyVSCodeExtension:completion:persistence:removed', {
            id: '123',
        })
    })
})
