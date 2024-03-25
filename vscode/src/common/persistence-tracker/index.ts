import levenshtein from 'js-levenshtein'
import * as vscode from 'vscode'

import { updateRangeMultipleChanges } from '../../non-stop/tracked-range'

import type {
    PersistencePresentEventPayload,
    PersistenceRemovedEventPayload,
    TrackedInsertion,
} from './types'
import { lines } from './utils'

const MEASURE_TIMEOUTS = [
    30 * 1000, // 30 seconds
    120 * 1000, // 2 minutes
    300 * 1000, // 5 minutes
    600 * 1000, // 10 minutes
]

export class PersistenceTracker<T = string> implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private managedTimeouts: Set<NodeJS.Timeout> = new Set()
    // We use a map from the document URI to the set of tracked insertions inside that document to
    // improve performance of the `onDidChangeTextDocument` event handler.
    private trackedInsertions: Map<string, Set<TrackedInsertion<T>>> = new Map()

    constructor(
        workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidRenameFiles' | 'onDidDeleteFiles'
        >,
        public logger: {
            onRemoved: (event: PersistenceRemovedEventPayload<T>) => void
            onPresent: (event: PersistencePresentEventPayload<T>) => void
        }
    ) {
        this.disposables.push(workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)))
        this.disposables.push(workspace.onDidRenameFiles(this.onDidRenameFiles.bind(this)))
        this.disposables.push(workspace.onDidDeleteFiles(this.onDidDeleteFiles.bind(this)))
    }

    public track({
        id,
        insertedAt,
        insertText,
        insertRange,
        document,
    }: {
        id: T
        insertedAt: number
        insertText: string
        insertRange: vscode.Range
        document: vscode.TextDocument
    }): void {
        if (insertText.length === 0) {
            return
        }

        // The range for the insertion is relative to the state before the insertion was inserted.
        // We need to convert it to the state after the insertion was inserted.
        const textLines = lines(insertText)
        const latestRange = new vscode.Range(
            insertRange.start.line,
            insertRange.start.character,
            insertRange.end.line + textLines.length - 1,

            textLines.length > 1
                ? textLines.at(-1)!.length
                : insertRange.end.character + textLines[0].length
        )

        const trackedInsertion = {
            insertText,
            insertRange,
            document,
            id,
            insertedAt,
            latestRange,
            uri: document.uri,
        }

        let documentInsertions = this.trackedInsertions.get(document.uri.toString())
        if (!documentInsertions) {
            documentInsertions = new Set([])
            this.trackedInsertions.set(document.uri.toString(), documentInsertions)
        }

        documentInsertions.add(trackedInsertion)
        const firstTimeoutIndex = 0
        this.enqueueMeasure(trackedInsertion, firstTimeoutIndex)
    }

    private enqueueMeasure(trackedInsertion: TrackedInsertion<T>, nextTimeoutIndex: number): void {
        const timeout = trackedInsertion.insertedAt + MEASURE_TIMEOUTS[nextTimeoutIndex] - Date.now()
        const timeoutId = setTimeout(() => {
            this.managedTimeouts.delete(timeoutId)
            this.measure(trackedInsertion, nextTimeoutIndex)
        }, timeout)
        this.managedTimeouts.add(timeoutId)
    }

    private measure(
        trackedInsertion: TrackedInsertion<T>,
        // The index in the MEASURE_TIMEOUTS array
        measureTimeoutsIndex: number
    ): void {
        const isStillTracked = this.trackedInsertions
            .get(trackedInsertion.uri.toString())
            ?.has(trackedInsertion)
        if (!isStillTracked) {
            return
        }

        const initialText = trackedInsertion.insertText
        const latestText = trackedInsertion.document.getText(trackedInsertion.latestRange)

        if (latestText.length === 0) {
            // Text was fully deleted
            this.logger.onRemoved({ id: trackedInsertion.id })
        } else {
            const maxLength = Math.max(initialText.length, latestText.length)
            const editOperations = levenshtein(initialText, latestText)
            const difference = editOperations / maxLength

            this.logger.onPresent({
                id: trackedInsertion.id,
                afterSec: MEASURE_TIMEOUTS[measureTimeoutsIndex] / 1000,
                difference,
                lineCount:
                    trackedInsertion.latestRange.end.line - trackedInsertion.latestRange.start.line + 1,
                charCount: latestText.length,
            })

            // If the text is not deleted yet and there are more timeouts, schedule a new run.
            if (measureTimeoutsIndex < MEASURE_TIMEOUTS.length - 1) {
                this.enqueueMeasure(trackedInsertion, measureTimeoutsIndex + 1)
                return
            }
        }

        // Remove the insertion from the tracking set.
        const documentInsertions = this.trackedInsertions.get(trackedInsertion.uri.toString())
        if (!documentInsertions) {
            return
        }
        documentInsertions.delete(trackedInsertion)
        if (documentInsertions.size === 0) {
            this.trackedInsertions.delete(trackedInsertion.uri.toString())
        }
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        const documentInsertions = this.trackedInsertions.get(event.document.uri.toString())

        if (!documentInsertions) {
            return
        }
        // Create a list of changes that can be mutated by the `updateRangeMultipleChanges` function
        const mutableChanges = event.contentChanges.map(change => ({
            range: change.range,
            text: change.text,
        }))

        for (const trackedInsertion of documentInsertions) {
            trackedInsertion.latestRange = updateRangeMultipleChanges(
                trackedInsertion.latestRange,
                mutableChanges
            )
        }
    }

    private onDidRenameFiles(event: vscode.FileRenameEvent): void {
        for (const file of event.files) {
            const documentInsertions = this.trackedInsertions.get(file.oldUri.toString())
            if (documentInsertions) {
                this.trackedInsertions.set(file.newUri.toString(), documentInsertions)
                this.trackedInsertions.delete(file.oldUri.toString())
                // Note: We maintain a reference to the TextDocument. After a renaming, this will
                // still be able to read content for the right file (I tested this). However, the
                // TextDocument#uri for this will then resolve to the previous URI (it seems to be
                // cached) so we need to update a manual copy of that URI
                for (const trackedInsertion of documentInsertions) {
                    trackedInsertion.uri = file.newUri
                }
            }
        }
    }

    private onDidDeleteFiles(event: vscode.FileDeleteEvent): void {
        for (const uri of event.files) {
            this.trackedInsertions.delete(uri.toString())
        }
    }

    public dispose(): void {
        for (const timeoutId of this.managedTimeouts) {
            clearTimeout(timeoutId)
        }
        this.managedTimeouts.clear()
        this.trackedInsertions.clear()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
