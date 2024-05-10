import { testFileUri } from '@sourcegraph/cody-shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { document } from '../completions/test-helpers'
import { range } from '../testutils/textDocument'
import { trackRejection } from './rejection-tracker'

const singleCharacterChange: vscode.TextDocumentContentChangeEvent = {
    range: range(0, 0, 0, 0),
    text: 'B',
    rangeLength: 0,
    rangeOffset: 0,
}

const multiCharacterChange: vscode.TextDocumentContentChangeEvent = {
    ...singleCharacterChange,
    text: 'Beans', // multi-character change, could be from a command or formatter
}

const whitespaceChange: vscode.TextDocumentContentChangeEvent = {
    ...singleCharacterChange,
    text: ' ', // whitespace only change
}

describe('trackRejection', () => {
    const onAcceptedSpy = vi.fn()
    const onRejectedSpy = vi.fn()

    // Mock workspace APIs to trigger document changes
    let onDidChangeTextDocument: (event: vscode.TextDocumentChangeEvent) => void
    let onDidDeleteFiles: (event: vscode.FileDeleteEvent) => void
    let onDidCloseTextDocument: (event: vscode.TextDocument) => void

    const mockWorkspace: Pick<
        typeof vscode.workspace,
        | 'onDidChangeTextDocument'
        | 'onDidDeleteFiles'
        | 'onDidCloseTextDocument'
        | 'onDidSaveTextDocument'
    > = {
        onDidChangeTextDocument(listener) {
            onDidChangeTextDocument = listener
            return { dispose: () => {} }
        },
        onDidDeleteFiles(listener) {
            onDidDeleteFiles = listener
            return { dispose: () => {} }
        },
        onDidCloseTextDocument(listener) {
            onDidCloseTextDocument = listener
            return { dispose: () => {} }
        },
        onDidSaveTextDocument(listener) {
            return { dispose: () => {} }
        },
    }
    const mockDocument = document('Hello, world!')
    const mockTask = {
        id: 'task-id',
        intent: 'edit',
        undoEvent: new vscode.EventEmitter(),
    }

    afterEach(() => {
        vi.resetAllMocks()
    })

    describe('file rejections', () => {
        it('should call onRejected when document is deleted', () => {
            trackRejection(
                mockDocument,
                mockWorkspace,
                { onAccepted: onAcceptedSpy, onRejected: onRejectedSpy },
                mockTask as any
            )

            onDidDeleteFiles({ files: [mockDocument.uri] })

            // File deleted, mark task as rejected
            expect(onAcceptedSpy).not.toHaveBeenCalled()
            expect(onRejectedSpy).toHaveBeenCalled()
        })

        it('should not onRejected when a different document is deleted', () => {
            const otherDoc = document('World, Hello!', undefined, testFileUri('other.ts').toString())

            trackRejection(
                mockDocument,
                mockWorkspace,
                { onAccepted: onAcceptedSpy, onRejected: onRejectedSpy },
                mockTask as any
            )

            onDidDeleteFiles({ files: [otherDoc.uri] })

            // Other file deleted, do nothing
            expect(onAcceptedSpy).not.toHaveBeenCalled()
            expect(onRejectedSpy).not.toHaveBeenCalled()
        })

        it('for the test intent should call onRejected when document is closed without being saved', () => {
            trackRejection(
                mockDocument,
                mockWorkspace,
                { onAccepted: onAcceptedSpy, onRejected: onRejectedSpy },
                { ...mockTask, intent: 'test' } as any
            )

            Object.assign(mockDocument, { isUntitled: true })
            onDidCloseTextDocument(mockDocument)

            // File closed without being saved, mark task as rejected
            expect(onAcceptedSpy).not.toHaveBeenCalled()
            expect(onRejectedSpy).toHaveBeenCalled()
        })

        it('for the test intent should not call onRejected when document is closed after being saved', () => {
            trackRejection(
                mockDocument,
                mockWorkspace,
                { onAccepted: onAcceptedSpy, onRejected: onRejectedSpy },
                { ...mockTask, intent: 'test' } as any
            )

            onDidCloseTextDocument(mockDocument)

            // File closed without being saved, mark task as rejected
            expect(onAcceptedSpy).not.toHaveBeenCalled()
            expect(onRejectedSpy).toHaveBeenCalled()
        })
    })

    describe('in-file rejections', () => {
        it('should call onRejected when a task is undone and another change is made', () => {
            trackRejection(
                mockDocument,
                mockWorkspace,
                { onAccepted: onAcceptedSpy, onRejected: onRejectedSpy },
                mockTask as any
            )

            onDidChangeTextDocument({
                document: mockDocument,
                contentChanges: [singleCharacterChange],
                reason: vscode.TextDocumentChangeReason.Undo,
            })

            // Not called yet, we've only undone and redo is available
            expect(onAcceptedSpy).not.toHaveBeenCalled()
            expect(onRejectedSpy).not.toHaveBeenCalled()

            onDidChangeTextDocument({
                document: mockDocument,
                contentChanges: [singleCharacterChange],
                reason: undefined,
            })

            // Redo no longer available, accepted is called
            expect(onAcceptedSpy).not.toHaveBeenCalled()
            expect(onRejectedSpy).toHaveBeenCalled()
        })

        it('should call onRejected when the task is finally rejected', () => {
            trackRejection(
                mockDocument,
                mockWorkspace,
                { onAccepted: onAcceptedSpy, onRejected: onRejectedSpy },
                mockTask as any
            )

            onDidChangeTextDocument({
                document: mockDocument,
                contentChanges: [multiCharacterChange],
                reason: undefined,
            })

            // Mulit character change so we don't accept or reject
            expect(onAcceptedSpy).not.toHaveBeenCalled()
            expect(onRejectedSpy).not.toHaveBeenCalled()

            onDidChangeTextDocument({
                document: mockDocument,
                contentChanges: [singleCharacterChange],
                reason: vscode.TextDocumentChangeReason.Undo,
            })

            // We undid the multi-character change, not this task, do nothing
            expect(onAcceptedSpy).not.toHaveBeenCalled()
            expect(onRejectedSpy).not.toHaveBeenCalled()

            onDidChangeTextDocument({
                document: mockDocument,
                contentChanges: [singleCharacterChange],
                reason: vscode.TextDocumentChangeReason.Undo,
            })
            onDidChangeTextDocument({
                document: mockDocument,
                contentChanges: [singleCharacterChange],
                reason: undefined,
            })

            // Finally we have undone the task and made another edit
            expect(onAcceptedSpy).not.toHaveBeenCalled()
            expect(onRejectedSpy).toHaveBeenCalled()
        })
    })

    describe('in-file acceptance', () => {
        it('should call onAccepted when document is changed with valid characters', () => {
            trackRejection(
                mockDocument,
                mockWorkspace,
                { onAccepted: onAcceptedSpy, onRejected: onRejectedSpy },
                mockTask as any
            )
            onDidChangeTextDocument({
                document: mockDocument,
                contentChanges: [singleCharacterChange],
                reason: undefined,
            })

            // Single character change, accept task
            expect(onAcceptedSpy).toHaveBeenCalled()
            expect(onRejectedSpy).not.toHaveBeenCalled()
        })

        it('should not call onAccepted immediately for multi-character changes, but after the next change', () => {
            trackRejection(
                mockDocument,
                mockWorkspace,
                { onAccepted: onAcceptedSpy, onRejected: onRejectedSpy },
                mockTask as any
            )
            onDidChangeTextDocument({
                document: mockDocument,
                contentChanges: [multiCharacterChange],
                reason: undefined,
            })

            // Multi character change, so we do nothing as it could be from a
            // command or formatter
            expect(onAcceptedSpy).not.toHaveBeenCalled()
            expect(onRejectedSpy).not.toHaveBeenCalled()

            onDidChangeTextDocument({
                document: mockDocument,
                contentChanges: [singleCharacterChange],
                reason: undefined,
            })

            // Finally we make a single character change, we can accept
            expect(onAcceptedSpy).toHaveBeenCalled()
            expect(onRejectedSpy).not.toHaveBeenCalled()
        })

        it('should not call onAccepted immediately for white-space only changes, but after the next change', () => {
            trackRejection(
                mockDocument,
                mockWorkspace,
                { onAccepted: onAcceptedSpy, onRejected: onRejectedSpy },
                mockTask as any
            )
            onDidChangeTextDocument({
                document: mockDocument,
                contentChanges: [whitespaceChange],
                reason: undefined,
            })

            // Single character change, but only whitespace, not enough of a signal
            // for acceptance, do nothing.
            expect(onAcceptedSpy).not.toHaveBeenCalled()
            expect(onRejectedSpy).not.toHaveBeenCalled()

            onDidChangeTextDocument({
                document: mockDocument,
                contentChanges: [singleCharacterChange],
                reason: undefined,
            })

            // Finally a single character change, accept
            expect(onAcceptedSpy).toHaveBeenCalled()
            expect(onRejectedSpy).not.toHaveBeenCalled()
        })
    })
})
