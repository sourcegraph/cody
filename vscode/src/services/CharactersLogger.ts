import * as vscode from 'vscode'

import { isFileURI, telemetryRecorder } from '@sourcegraph/cody-shared'
import { outputChannelLogger } from '../output-channel-logger'

export const LOG_INTERVAL = 30 * 60 * 1000 // 30 minutes
export const RAPID_CHANGE_TIMEOUT = 15
export const SELECTION_TIMEOUT = 5000

export const changeBoundaries = {
    xxxs_change: { min: 0, max: 2 },
    xxs_change: { min: 3, max: 10 },
    xs_change: { min: 11, max: 50 },
    s_change: { min: 51, max: 200 },
    m_change: { min: 200, max: 1000 },
    l_change: { min: 1001, max: 3000 },
    xl_change: { min: 3001, max: 10000 },
    xxl_change: { min: 10001, max: 50000 },
    xxxl_change: { min: 50001, max: Number.POSITIVE_INFINITY },
} as const

const changeBoundariesKeys = Object.keys(changeBoundaries) as (keyof typeof changeBoundaries)[]
const staleChangeBoundariesKeys = changeBoundariesKeys.map(key => `stale_selection_${key}` as const)

const SPECIAL_DOCUMENT_CHANGE_TYPES = [
    'undo',
    'redo',
    'window_not_focused',
    'non_visible_document',
    'non_active_editor',
    'outside_of_visible_ranges',
    'stale_selection',
    'rapid_change', // occurred in less than RAPID_CHANGE_TIMEOUT after/before another change
    'unexpected', // should not be logged because all the change sizes are covered by the keys above
] as const

const DOCUMENT_CHANGE_TYPES = [
    ...SPECIAL_DOCUMENT_CHANGE_TYPES,
    ...changeBoundariesKeys,
    ...staleChangeBoundariesKeys,
] as const

type DocumentChangeType = (typeof DOCUMENT_CHANGE_TYPES)[number]

// This flat structure is required by the 'metadata' field type in the telemetry event.
export type CharacterLoggerCounters = {
    [K in `${DocumentChangeType}_${'inserted' | 'deleted'}` | DocumentChangeType]: number
}

export const DEFAULT_COUNTERS = DOCUMENT_CHANGE_TYPES.reduce((acc, changeType) => {
    // To count the number of characters inserted/deleted
    acc[`${changeType}_inserted`] = 0
    acc[`${changeType}_deleted`] = 0

    // To count the number of events
    acc[changeType] = 0

    return acc
}, {} as CharacterLoggerCounters)

export class CharactersLogger implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private changeCounters: CharacterLoggerCounters = { ...DEFAULT_COUNTERS }
    private nextTimeoutId: NodeJS.Timeout | null = null

    private windowFocused = true
    private activeTextEditor: vscode.TextEditor | undefined
    private visibleDocuments = new Set<string>()
    private visibleRangesMap: Map<string, Readonly<vscode.Range[]>> = new Map()
    private lastChangeTimestamp = 0
    private lastSelectionTimestamps = new Map<string, number>()

    constructor(
        workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidCloseTextDocument'
        > = vscode.workspace,
        window: Pick<
            typeof vscode.window,
            | 'activeTextEditor'
            | 'onDidChangeWindowState'
            | 'onDidChangeActiveTextEditor'
            | 'onDidChangeVisibleTextEditors'
            | 'onDidChangeTextEditorVisibleRanges'
            | 'onDidChangeTextEditorSelection'
            | 'visibleTextEditors'
        > = vscode.window
    ) {
        this.disposables.push(
            workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)),
            workspace.onDidCloseTextDocument(document => {
                const uri = document.uri.toString()
                this.lastSelectionTimestamps.delete(uri)
                this.visibleDocuments.delete(uri)
                this.visibleRangesMap.delete(uri)
            }),
            window.onDidChangeWindowState(state => {
                this.windowFocused = state.focused
            }),
            window.onDidChangeActiveTextEditor(editor => {
                this.activeTextEditor = editor
            }),
            window.onDidChangeVisibleTextEditors(editors => {
                this.updateVisibleDocuments(editors)
            }),
            window.onDidChangeTextEditorSelection(event => {
                const documentUri = event.textEditor.document.uri.toString()
                this.lastSelectionTimestamps.set(documentUri, Date.now())
            }),
            window.onDidChangeTextEditorVisibleRanges(event => {
                const documentUri = event.textEditor.document.uri.toString()
                this.visibleRangesMap.set(documentUri, event.visibleRanges)
            })
        )

        this.updateVisibleDocuments(window.visibleTextEditors)
        this.activeTextEditor = window.activeTextEditor
        this.nextTimeoutId = setTimeout(() => this.flush(), LOG_INTERVAL)
    }

    public flush(): void {
        try {
            this.nextTimeoutId = null
            telemetryRecorder.recordEvent('cody.characters', 'flush', {
                metadata: { ...this.changeCounters },
            })
        } catch (error) {
            outputChannelLogger.logError('CharactersLogger', 'Failed to record telemetry event:', error)
        } finally {
            this.changeCounters = { ...DEFAULT_COUNTERS }
            this.nextTimeoutId = setTimeout(() => this.flush(), LOG_INTERVAL)
        }
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        if (!isFileURI(event.document.uri)) {
            return
        }

        const totalChangeSize = event.contentChanges.reduce((sum, change) => {
            return sum + Math.abs(change.rangeLength) + Math.abs(change.text.length)
        }, 0)

        const changeType = this.getDocumentChangeType(event, totalChangeSize)
        this.changeCounters[changeType]++
        const { activeTextEditor } = this

        for (const change of event.contentChanges) {
            // TODO: manually test active test editor visible ranges staleness
            const isChangeVisible = activeTextEditor?.visibleRanges.some(range =>
                range.contains(change.range)
            )

            const isSpecialChangeType = SPECIAL_DOCUMENT_CHANGE_TYPES.find(v => v === changeType)
            const contentChangeType =
                !isSpecialChangeType && !isChangeVisible ? 'outside_of_visible_ranges' : changeType

            // We use change.rangeLength for deletions because:
            // 1. It represents the length of the text being replaced, including newline characters.
            // 2. It accurately accounts for multi-line deletions.
            // 3. For pure deletions (without insertions), this will be the number of characters removed.
            // 4. For replacements, this represents the "old" text that's being replaced.
            this.changeCounters[`${contentChangeType}_deleted`] += change.rangeLength

            // We use change.text.length for insertions because:
            // 1. It represents the length of the new text being inserted, including newline characters.
            // 2. It accurately accounts for multi-line insertions.
            // 3. For pure insertions (without deletions), this will be the number of characters added.
            // 4. For replacements, this represents the "new" text that's replacing the old.
            this.changeCounters[`${contentChangeType}_inserted`] += change.text.length

            // Note: In the case of replacements, both deleted and inserted will be incremented.
            // This accurately represents that some text was removed and some was added, even if
            // the lengths are the same.
        }

        if (totalChangeSize > 0) {
            this.lastChangeTimestamp = Date.now()
        }
        console.log(
            `changes: [${event.contentChanges.map(c => c.text).join(',')}]`,
            JSON.stringify(this.changeCounters, null, 2)
        )
    }

    private getDocumentChangeType(
        event: vscode.TextDocumentChangeEvent,
        totalChangeSize: number
    ): DocumentChangeType {
        const currentTimestamp = Date.now()
        const documentUri = event.document.uri.toString()

        if (event.reason === vscode.TextDocumentChangeReason.Undo) {
            return 'undo'
        }

        if (event.reason === vscode.TextDocumentChangeReason.Redo) {
            return 'redo'
        }

        if (!this.windowFocused) {
            return 'window_not_focused'
        }

        if (!vscode.window.activeTextEditor) {
            return 'non_active_editor'
        }

        const timeSinceLastChange = currentTimestamp - this.lastChangeTimestamp
        if (timeSinceLastChange < RAPID_CHANGE_TIMEOUT) {
            return 'rapid_change'
        }

        const lastSelectionTimestamp = this.lastSelectionTimestamps.get(documentUri) || 0
        const isSelectionStale = currentTimestamp - lastSelectionTimestamp > SELECTION_TIMEOUT

        for (const [changeSizeType, boundaries] of Object.entries(changeBoundaries)) {
            if (boundaries.min <= totalChangeSize && totalChangeSize <= boundaries.max) {
                return (
                    isSelectionStale ? `stale_selection_${changeSizeType}` : changeSizeType
                ) as DocumentChangeType
            }
        }

        return 'unexpected'
    }

    private updateVisibleDocuments(editors: Readonly<vscode.TextEditor[]>): void {
        this.visibleDocuments.clear()
        for (const editor of editors) {
            const uri = editor.document.uri.toString()
            this.visibleDocuments.add(uri)
            this.visibleRangesMap.set(uri, editor.visibleRanges)
        }
    }

    public dispose(): void {
        this.flush()
        if (this.nextTimeoutId) {
            clearTimeout(this.nextTimeoutId)
        }
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
