import * as vscode from 'vscode'

import { updateRangeMultipleChanges } from '../non-stop/tracked-range'

import { CompletionID } from './logger'
import { lines } from './text-processing'
import { LevenshteinCompare } from './text-processing/string-comparator'
import { InlineCompletionItem } from './types'

const MEASURE_TIMEOUTS = [
    1 * 1000, // 1 second
    5 * 1000, // 5 seconds
    15 * 1000, // 15 seconds
    30 * 1000, // 30 seconds
    120 * 1000, // 2 minutes
    300 * 1000, // 5 minutes
    600 * 1000, // 10 minutes
]
interface TrackedCompletion {
    id: CompletionID
    document: vscode.TextDocument
    insertedAt: number
    completion: InlineCompletionItem
    latestRange: vscode.Range
}
export class PersistenceTracker implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private managedTimeouts: Set<NodeJS.Timeout> = new Set()
    private trackedCompletions: Map<CompletionID, TrackedCompletion> = new Map()

    constructor() {
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)))
    }

    public track(
        id: CompletionID,
        insertedAt: number,
        completion: InlineCompletionItem,
        document: vscode.TextDocument
    ): void {
        console.log('start tracking ', id, JSON.stringify(completion.range))
        if (!completion.range) {
            throw new Error('Completion insertion must have a range')
        }

        // The range for the completion is relative to the state before the completion was inserted.
        // We need to convert it to the state after the completion was inserted.
        const textLines = lines(completion.insertText)
        const latestRange = new vscode.Range(
            completion.range.start.line,
            completion.range.start.character,
            completion.range.end.line + textLines.length - 1,
            textLines.length > 1
                ? textLines[textLines.length - 1].length
                : completion.range.end.character + textLines[0].length
        )

        const trackedCompletion = {
            id,
            insertedAt,
            completion,
            document,
            latestRange,
        }

        this.trackedCompletions.set(trackedCompletion.id, trackedCompletion)
        const firstTimeoutIndex = 0
        this.enqueueMeasure(trackedCompletion, firstTimeoutIndex)
    }

    private enqueueMeasure(trackedCompletion: TrackedCompletion, nextTimeoutIndex: number): void {
        const timeoutId = setTimeout(() => {
            this.managedTimeouts.delete(timeoutId)
            this.measure(trackedCompletion, nextTimeoutIndex)
        }, MEASURE_TIMEOUTS[nextTimeoutIndex])
        this.managedTimeouts.add(timeoutId)
        console.log(this.managedTimeouts)
    }

    private measure(
        trackedCompletion: TrackedCompletion,
        // The index in the MEASURE_TIMEOUTS array
        measureTimeoutsIndex: number
    ): void {
        console.log('measure ', trackedCompletion.id)
        const initialText = trackedCompletion.completion.insertText
        const latestText = trackedCompletion.document.getText(trackedCompletion.latestRange)

        const difference = LevenshteinCompare(initialText, latestText)

        console.log({ after: MEASURE_TIMEOUTS[measureTimeoutsIndex] / 1000, difference, initialText, latestText })

        if (measureTimeoutsIndex < MEASURE_TIMEOUTS.length - 1) {
            this.enqueueMeasure(trackedCompletion, measureTimeoutsIndex + 1)
            return
        }

        this.trackedCompletions.delete(trackedCompletion.id)
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        for (const [_, trackedCompletion] of this.trackedCompletions) {
            if (trackedCompletion.document.uri.toString() !== event.document.uri.toString()) {
                continue
            }

            const before = trackedCompletion.latestRange

            trackedCompletion.latestRange = updateRangeMultipleChanges(
                trackedCompletion.latestRange,
                event.contentChanges.map(change => ({
                    range: change.range,
                    text: change.text,
                }))
            )
            console.log('Updated ranges', JSON.stringify(before), JSON.stringify(trackedCompletion.latestRange))
        }
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
