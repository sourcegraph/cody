import levenshtein from 'js-levenshtein'
import * as vscode from 'vscode'

import { updateRangeMultipleChanges } from '../non-stop/tracked-range'

import { CompletionID, logCompletionEvent } from './logger'
import { lines } from './text-processing'
import { InlineCompletionItem } from './types'

const MEASURE_TIMEOUTS = [
    30 * 1000, // 30 seconds
    120 * 1000, // 2 minutes
    300 * 1000, // 5 minutes
    600 * 1000, // 10 minutes
]
interface TrackedCompletion {
    id: CompletionID
    uri: vscode.Uri
    // When a document is rename, the TextDocument instance will still work
    // however the URI it resolves to will be outdated. Ensure we never use it.
    document: Omit<vscode.TextDocument, 'uri'>
    insertedAt: number
    completion: InlineCompletionItem
    latestRange: vscode.Range
}
export class PersistenceTracker implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private managedTimeouts: Set<NodeJS.Timeout> = new Set()
    // We use a map from the document URI to the set of tracked completions inside that document to
    // improve performance of the `onDidChangeTextDocument` event handler.
    private trackedCompletions: Map<string, Set<TrackedCompletion>> = new Map()

    constructor(
        workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidRenameFiles' | 'onDidDeleteFiles'
        > = vscode.workspace
    ) {
        this.disposables.push(workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)))
        this.disposables.push(workspace.onDidRenameFiles(this.onDidRenameFiles.bind(this)))
        this.disposables.push(workspace.onDidDeleteFiles(this.onDidDeleteFiles.bind(this)))
    }

    public track({
        id,
        insertedAt,
        completion,
        document,
    }: {
        id: CompletionID
        insertedAt: number
        completion: InlineCompletionItem
        document: vscode.TextDocument
    }): void {
        if (!completion.range || completion.insertText.length === 0) {
            return
        }

        // The range for the completion is relative to the state before the completion was inserted.
        // We need to convert it to the state after the completion was inserted.
        const textLines = lines(completion.insertText)
        const latestRange = new vscode.Range(
            completion.range.start.line,
            completion.range.start.character,
            completion.range.end.line + textLines.length - 1,
            textLines.length > 1 ? textLines.at(-1)!.length : completion.range.end.character + textLines[0].length
        )

        const trackedCompletion = {
            completion,
            document,
            id,
            insertedAt,
            latestRange,
            uri: document.uri,
        }

        let documentCompletions = this.trackedCompletions.get(document.uri.toString())
        if (!documentCompletions) {
            documentCompletions = new Set([])
            this.trackedCompletions.set(document.uri.toString(), documentCompletions)
        }

        documentCompletions.add(trackedCompletion)
        const firstTimeoutIndex = 0
        this.enqueueMeasure(trackedCompletion, firstTimeoutIndex)
    }

    private enqueueMeasure(trackedCompletion: TrackedCompletion, nextTimeoutIndex: number): void {
        const timeout = trackedCompletion.insertedAt + MEASURE_TIMEOUTS[nextTimeoutIndex] - Date.now()
        const timeoutId = setTimeout(() => {
            this.managedTimeouts.delete(timeoutId)
            this.measure(trackedCompletion, nextTimeoutIndex)
        }, timeout)
        this.managedTimeouts.add(timeoutId)
    }

    private measure(
        trackedCompletion: TrackedCompletion,
        // The index in the MEASURE_TIMEOUTS array
        measureTimeoutsIndex: number
    ): void {
        const isStillTracked = this.trackedCompletions.get(trackedCompletion.uri.toString())?.has(trackedCompletion)
        if (!isStillTracked) {
            return
        }

        const initialText = trackedCompletion.completion.insertText
        const latestText = trackedCompletion.document.getText(trackedCompletion.latestRange)

        if (latestText.length === 0) {
            // Text was fully deleted
            logCompletionEvent('persistence:removed', { id: trackedCompletion.id })
        } else {
            const maxLength = Math.max(initialText.length, latestText.length)
            const editOperations = levenshtein(initialText, latestText)
            const difference = editOperations / maxLength
            const isMostlyUnchanged = difference < 0.33

            logCompletionEvent('persistence:present', {
                id: trackedCompletion.id,
                afterSec: MEASURE_TIMEOUTS[measureTimeoutsIndex] / 1000,
                isMostlyUnchanged,
                difference,
                lineCount: trackedCompletion.latestRange.end.line - trackedCompletion.latestRange.start.line + 1,
                charCount: latestText.length,
            })

            // If the text is not deleted yet and there are more timeouts, schedule a new run.
            if (measureTimeoutsIndex < MEASURE_TIMEOUTS.length - 1) {
                this.enqueueMeasure(trackedCompletion, measureTimeoutsIndex + 1)
                return
            }
        }

        // Remove the completion from the tracking set.
        const documentCompletions = this.trackedCompletions.get(trackedCompletion.uri.toString())
        if (!documentCompletions) {
            return
        }
        documentCompletions.delete(trackedCompletion)
        if (documentCompletions.size === 0) {
            this.trackedCompletions.delete(trackedCompletion.uri.toString())
        }
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        const documentCompletions = this.trackedCompletions.get(event.document.uri.toString())

        if (!documentCompletions) {
            return
        }

        // Create a list of changes that can be mutated by the `updateRangeMultipleChanges` function
        const mutableChanges = event.contentChanges.map(change => ({
            range: change.range,
            text: change.text,
        }))

        for (const trackedCompletion of documentCompletions) {
            trackedCompletion.latestRange = updateRangeMultipleChanges(trackedCompletion.latestRange, mutableChanges)
        }
    }

    private onDidRenameFiles(event: vscode.FileRenameEvent): void {
        for (const file of event.files) {
            const documentCompletions = this.trackedCompletions.get(file.oldUri.toString())
            if (documentCompletions) {
                this.trackedCompletions.set(file.newUri.toString(), documentCompletions)
                this.trackedCompletions.delete(file.oldUri.toString())
                // Note: We maintain a reference to the TextDocument. After a renaming, this will
                // still be able to read content for the right file (I tested this). However, the
                // TextDocument#uri for this will then resolve to the previous URI (it seems to be
                // cached) so we need to update a manual copy of that URI
                for (const trackedCompletion of documentCompletions) {
                    trackedCompletion.uri = file.newUri
                }
            }
        }
    }

    private onDidDeleteFiles(event: vscode.FileDeleteEvent): void {
        for (const uri of event.files) {
            this.trackedCompletions.delete(uri.toString())
        }
    }

    public dispose(): void {
        for (const timeoutId of this.managedTimeouts) {
            clearTimeout(timeoutId)
        }
        this.managedTimeouts.clear()
        this.trackedCompletions.clear()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
