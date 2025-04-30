import * as vscode from 'vscode'

import type { AutoeditRequestState } from '../analytics-logger/types'
import { type AutoeditsProviderConfig, autoeditsProviderConfig } from '../autoedits-config'
import { getDecorationInfo } from '../renderer/diff-utils'
import { type GeneratedImageSuggestion, generateSuggestionAsImage } from '../renderer/image-gen'
import { makeVisualDiff } from '../renderer/image-gen/visual-diff'
import type { AutoeditDebugMessageFromExtension } from './debug-protocol'
import { type AutoeditSessionStats, SessionStatsTracker } from './session-stats'

/**
 * Enhanced debug entry for auto-edit requests that extends the analytics logger state
 * with additional debug-specific properties.
 */
export interface AutoeditRequestDebugState {
    /** The underlying analytics logger state object */
    state: AutoeditRequestState
    /** Timestamp when the status was last updated */
    updatedAt: number
    /** The autoedits provider config used for this request */
    autoeditsProviderConfig: AutoeditsProviderConfig
    /** The unified diff of the suggestion */
    unifiedDiff?: GeneratedImageSuggestion
    /** Session statistics for the request */
    sessionStats?: AutoeditSessionStats
}

const CHARACTER_REGEX = /./g

/**
 * A simple in-memory store for debugging auto-edit requests.
 * Stores the most recent requests in a ring buffer.
 */
export class AutoeditDebugStore implements vscode.Disposable {
    /** Auto-edit requests, stored in reverse chronological order (newest first) */
    private autoeditRequests: AutoeditRequestDebugState[] = []
    private sessionStatsTracker = new SessionStatsTracker()

    /** Maximum number of auto-edit requests to store */
    private maxEntries = process.env.NODE_ENV === 'development' ? 500 : 100
    /** Event emitter for notifying when data changes */
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    /** Event that fires when the auto-edit requests data changes */
    public readonly onDidChange = this.onDidChangeEmitter.event

    /**
     * Add a new auto-edit request debug state to the store.
     * If the store is full, the oldest entry will be removed.
     */
    public addAutoeditRequestDebugState(state: AutoeditRequestState): void {
        const requestId = state.requestId
        const existingIndex = this.autoeditRequests.findIndex(
            entry => entry.state.requestId === requestId
        )

        if (existingIndex !== -1) {
            this.updateExistingEntry(existingIndex, state)
        } else {
            this.addNewEntry(state)
        }
    }

    private updateExistingEntry(index: number, state: AutoeditRequestState): void {
        const entry = this.autoeditRequests[index]

        this.autoeditRequests[index] = this.createDebugState(state, {
            ...entry,
            state,
            unifiedDiff: this.calculateUnifiedDiff(state),
        })

        this.notifyChange()
    }

    private addNewEntry(state: AutoeditRequestState): void {
        const debugState = this.createDebugState(state)
        this.autoeditRequests.unshift(debugState)

        this.enforceMaxEntries()
        this.notifyChange()
    }

    private createDebugState(
        state: AutoeditRequestState,
        baseState?: Partial<AutoeditRequestDebugState>
    ): AutoeditRequestDebugState {
        const entry: AutoeditRequestDebugState = {
            state,
            updatedAt: Date.now(),
            autoeditsProviderConfig: { ...autoeditsProviderConfig },
            unifiedDiff: this.calculateUnifiedDiff(state),
            ...baseState,
        }

        if (
            ['contextLoaded', 'loaded', 'suggested', 'read', 'accepted', 'rejected'].includes(
                state.phase
            )
        ) {
            this.sessionStatsTracker.trackRequest(entry)
        }

        return entry
    }

    private calculateUnifiedDiff(state: AutoeditRequestState): GeneratedImageSuggestion | undefined {
        const decorationInfo =
            'prediction' in state && state.prediction
                ? getDecorationInfo(
                      state.codeToReplaceData.codeToRewrite,
                      state.prediction,
                      CHARACTER_REGEX
                  )
                : undefined

        if (!decorationInfo) {
            return
        }

        const { diff } = makeVisualDiff(decorationInfo, 'unified', state.document)
        return generateSuggestionAsImage({
            diff,
            lang: state.document.languageId,
            mode: 'unified',
        })
    }

    private enforceMaxEntries(): void {
        if (this.autoeditRequests.length > this.maxEntries) {
            this.autoeditRequests = this.autoeditRequests.slice(0, this.maxEntries)
        }
    }

    private notifyChange(): void {
        this.onDidChangeEmitter.fire()
    }

    public getDebugState(): Omit<AutoeditDebugMessageFromExtension, 'type'> {
        return {
            entries: this.autoeditRequests,
            ...this.sessionStatsTracker.getSessionStats(),
        }
    }

    public dispose(): void {
        this.onDidChangeEmitter.dispose()
    }
}

// Singleton instance
export const autoeditDebugStore = new AutoeditDebugStore()
