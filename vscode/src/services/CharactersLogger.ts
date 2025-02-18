import omit from 'lodash/omit'
import * as vscode from 'vscode'

import { isFileURI, telemetryRecorder } from '@sourcegraph/cody-shared'

import { outputChannelLogger } from '../output-channel-logger'

import { splitSafeMetadata } from './telemetry-v2'
import {
    isCodeFromChatCodeBlockAction,
    recordPasteFromChatEvent,
} from './utils/codeblock-action-tracker'

export const LOG_INTERVAL = 30 * 60 * 1000 // 30 minutes
export const RAPID_CHANGE_TIMEOUT = 15
export const SELECTION_TIMEOUT = 5000

const changeBoundaries = {
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
const staleAndRapidChangeBoundariesKeys = changeBoundariesKeys.flatMap(
    key => [`stale_${key}`, `rapid_${key}`, `rapid_stale_${key}`] as const
)

const SPECIAL_DOCUMENT_CHANGE_TYPES = [
    'cody_chat',
    'undo',
    'redo',
    'window_not_focused',
    'no_active_editor',
    'outside_of_active_editor',
    'disjoint_change', // one change event with multiple disconnected change ranges
    'partially_outside_of_visible_ranges',
    'fully_outside_of_visible_ranges',
    'unexpected', // should not be logged because all the change sizes are covered by the keys above
] as const

vscode.window.activeTextEditor
const DOCUMENT_CHANGE_TYPES = [
    ...SPECIAL_DOCUMENT_CHANGE_TYPES,
    ...changeBoundariesKeys,
    ...staleAndRapidChangeBoundariesKeys,
] as const

type DocumentChangeType = (typeof DOCUMENT_CHANGE_TYPES)[number]
type DocumentChangeSize = keyof typeof changeBoundaries

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

interface ChangeEventMetadata {
    isUndo: boolean
    isRedo: boolean
    isSelectionStale: boolean
    isRapidChange: boolean
    isDisjoint: boolean
    isPartiallyOutsideOfVisibleRanges: boolean
    isFullyOutsideOfVisibleRanges: boolean
    windowNotFocused: boolean
    noActiveTextEditor: boolean
    outsideOfActiveEditor: boolean
    changeSize: DocumentChangeSize | undefined
    charsInserted: number
    charsDeleted: number
}

export interface CodeGenEventMetadata {
    isSelectionStale: number
    isDisjoint: number
    isPartiallyOutsideOfVisibleRanges: number
    isFullyOutsideOfVisibleRanges: number
    windowNotFocused: number
    noActiveTextEditor: number
    outsideOfActiveEditor: number
    charsInserted: number
    charsDeleted: number
}

export class CharactersLogger implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private changeCounters: CharacterLoggerCounters = { ...DEFAULT_COUNTERS }
    private nextTimeoutId: NodeJS.Timeout | null = null

    private windowFocused = true
    private activeTextEditor: vscode.TextEditor | undefined
    private lastChangeTimestamp = 0
    private lastSelectionTimestamps = new Map<string, number>()

    constructor(
        workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidCloseTextDocument'
        > = vscode.workspace,
        window: Pick<
            typeof vscode.window,
            | 'state'
            | 'activeTextEditor'
            | 'onDidChangeWindowState'
            | 'onDidChangeActiveTextEditor'
            | 'onDidChangeTextEditorSelection'
        > = vscode.window
    ) {
        this.disposables.push(
            workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)),
            workspace.onDidCloseTextDocument(document => {
                this.lastSelectionTimestamps.delete(document.uri.toString())
            }),
            window.onDidChangeWindowState(state => {
                this.windowFocused = state.focused
            }),
            window.onDidChangeActiveTextEditor(editor => {
                this.activeTextEditor = editor
            }),
            window.onDidChangeTextEditorSelection(event => {
                const documentUri = event.textEditor.document.uri.toString()
                this.lastSelectionTimestamps.set(documentUri, Date.now())
            }),
            vscode.commands.registerCommand('cody.debug.logCharacterCounters', () => {
                outputChannelLogger.logDebug('CharactersLogger', 'Current character counters:', {
                    verbose: this.changeCounters,
                })
            })
        )

        this.windowFocused = window.state.focused
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

    private async onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): Promise<void> {
        if (!isFileURI(event.document.uri)) {
            return
        }

        const changedText = event.contentChanges[0]?.text ?? ''
        let isChangeEventFromCodyChat = false

        if (changedText.length !== 0) {
            // We record paste events in the `onDidChangeTextDocument` handler to avoid race conditions,
            // since we synchronously mutate the internal state in `codeblock-action-tracker.ts`.
            //
            // Additionally, the characters logger needs to know if the change is coming from Cody
            // to accurately classify it.
            const codeBlockActionMatch = await isCodeFromChatCodeBlockAction(
                event.contentChanges[0]?.text
            )
            if (codeBlockActionMatch?.operation === 'paste') {
                // Sends the `cody.keyDown:paste` event.
                recordPasteFromChatEvent(codeBlockActionMatch)
            }

            // Marks the change as originating from Cody Chat to prevent double-counting.
            // For example, double-counting occurs when a change is counted both as a manual user input
            // and as characters from the `cody.keyDown:paste` event.
            isChangeEventFromCodyChat = Boolean(codeBlockActionMatch)
        }

        const changeEventMetadata = this.getChangeEventMetadata(event)

        const { charsInserted, charsDeleted } = changeEventMetadata
        const hasTextChanges = charsDeleted > 0 || charsInserted > 0

        if (hasTextChanges) {
            const changeType = this.getDocumentChangeType(changeEventMetadata, isChangeEventFromCodyChat)

            this.changeCounters[changeType]++
            this.changeCounters[`${changeType}_deleted`] += charsDeleted
            this.changeCounters[`${changeType}_inserted`] += charsInserted

            this.lastChangeTimestamp = Date.now()
        }
    }

    private getDocumentChangeType(
        metadata: Omit<ChangeEventMetadata, 'changeType'>,
        isChangeEventFromCodyChat = false
    ): DocumentChangeType {
        if (isChangeEventFromCodyChat) {
            return 'cody_chat'
        }

        if (metadata.isUndo) {
            return 'undo'
        }

        if (metadata.isRedo) {
            return 'redo'
        }

        if (metadata.windowNotFocused) {
            return 'window_not_focused'
        }

        if (metadata.noActiveTextEditor) {
            return 'no_active_editor'
        }

        if (metadata.outsideOfActiveEditor) {
            return 'outside_of_active_editor'
        }

        if (metadata.isDisjoint) {
            return 'disjoint_change'
        }

        if (metadata.isPartiallyOutsideOfVisibleRanges) {
            return 'partially_outside_of_visible_ranges'
        }

        if (metadata.isFullyOutsideOfVisibleRanges) {
            return 'fully_outside_of_visible_ranges'
        }

        const rapidPrefix = metadata.isRapidChange ? 'rapid_' : ''
        const stalePrefix = metadata.isSelectionStale ? 'stale_' : ''

        if (metadata.changeSize) {
            return `${rapidPrefix}${stalePrefix}${metadata.changeSize}`
        }

        return 'unexpected'
    }

    private getChangeEventMetadata(event: Partial<vscode.TextDocumentChangeEvent>): ChangeEventMetadata {
        const { document, contentChanges = [] } = event

        const currentTimestamp = Date.now()
        const uriString = document?.uri.toString() || 'document-not-provided'

        const isUndo = event.reason === vscode.TextDocumentChangeReason.Undo
        const isRedo = event.reason === vscode.TextDocumentChangeReason.Redo

        const isDisjoint = contentChanges.some(
            (change, i) => i > 0 && change.range.start.isAfter(contentChanges[i - 1].range.end)
        )

        const visibleRanges = this.activeTextEditor?.visibleRanges || []
        const isPartiallyOutsideOfVisibleRanges = contentChanges.some(
            change => !visibleRanges.some(visibleRange => visibleRange.contains(change.range))
        )
        const isFullyOutsideOfVisibleRanges = contentChanges.every(
            change => !visibleRanges.some(visibleRange => visibleRange.contains(change.range))
        )

        const lastSelectionTimestamp = this.lastSelectionTimestamps.get(uriString) || 0
        const isSelectionStale = currentTimestamp - lastSelectionTimestamp > SELECTION_TIMEOUT
        const isRapidChange = currentTimestamp - this.lastChangeTimestamp < RAPID_CHANGE_TIMEOUT

        const charCounts = contentChanges.reduce(
            (stats, change) => {
                stats.total += Math.abs(change.rangeLength) + Math.abs(change.text.length)

                // We use change.text.length for insertions because:
                // 1. It represents the length of the new text being inserted, including newline characters.
                // 2. It accurately accounts for multi-line insertions.
                // 3. For pure insertions (without deletions), this will be the number of characters added.
                // 4. For replacements, this represents the "new" text that's replacing the old.
                stats.inserted += change.text.length

                // We use change.rangeLength for deletions because:
                // 1. It represents the length of the text being replaced, including newline characters.
                // 2. It accurately accounts for multi-line deletions.
                // 3. For pure deletions (without insertions), this will be the number of characters removed.
                // 4. For replacements, this represents the "old" text that's being replaced.
                stats.deleted += change.rangeLength

                // Note: In the case of replacements, both deleted and inserted will be incremented.
                // This accurately represents that some text was removed and some was added, even if
                // the lengths are the same.
                return stats
            },
            {
                total: 0,
                inserted: 0,
                deleted: 0,
            }
        )

        const changeSizePair = Object.entries(changeBoundaries).find(([_, boundaries]) => {
            return boundaries.min <= charCounts.total && charCounts.total <= boundaries.max
        })

        const outsideOfActiveEditor = Boolean(
            this.activeTextEditor && this.activeTextEditor.document.uri.toString() !== uriString
        )

        return {
            isUndo,
            isRedo,
            isSelectionStale,
            isRapidChange,
            isDisjoint,
            isPartiallyOutsideOfVisibleRanges,
            isFullyOutsideOfVisibleRanges,
            windowNotFocused: !this.windowFocused,
            noActiveTextEditor: !this.activeTextEditor,
            outsideOfActiveEditor,
            changeSize: changeSizePair ? (changeSizePair[0] as DocumentChangeSize) : undefined,
            charsInserted: charCounts.inserted,
            charsDeleted: charCounts.deleted,
        }
    }

    public getChangeEventMetadataForCodyCodeGenEvents(
        event: Partial<vscode.TextDocumentChangeEvent>
    ): CodeGenEventMetadata {
        const rawMetadata = omit(this.getChangeEventMetadata(event), [
            'changeSize',
            'isRedo',
            'isUndo',
            'isRapidChange',
        ])

        return splitSafeMetadata(rawMetadata).metadata
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

export const charactersLogger = new CharactersLogger()
