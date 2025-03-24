import * as vscode from 'vscode'

import type { AutoeditRequestState } from '../analytics-logger/types'
import { type AutoeditsProviderConfig, autoeditsProviderConfig } from '../autoedits-config'
import type { DecorationInfo } from '../renderer/decorators/base'
import { getDecorationInfo } from '../renderer/diff-utils'

interface SessionStats {
    promptCacheHitRate: number
    promptCacheReqCount: number
}

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
    /**
     * The side-by-side diff decoration info for the auto-edit request
     * Different from the `state.updatedDecorationInfo` by the regex used to split
     * the code in chunks for diffing it.
     */
    sideBySideDiffDecorationInfo?: DecorationInfo
    /** The session stats for the auto-edit request */
    sessionStats: SessionStats
}

const CHARACTER_REGEX = /./g

/**
 * Tracks the stats for auto-edit requests across the session.
 */
export class SessionStatsTracker {
    private static instance: SessionStatsTracker
    private promptCacheHitRate = 0
    private promptCacheReqCount = 0

    private constructor() {}

    public static getInstance(): SessionStatsTracker {
        if (!SessionStatsTracker.instance) {
            SessionStatsTracker.instance = new SessionStatsTracker()
        }
        return SessionStatsTracker.instance
    }

    public trackRequest(state: AutoeditRequestState) {
        this.updatePromptCacheStats(state)
    }

    public getCurrentStats(): SessionStats {
        const sessionStats = {
            promptCacheHitRate: this.promptCacheHitRate,
            promptCacheReqCount: this.promptCacheReqCount,
        }
        console.log('SessionStatsTracker.getCurrentStats', sessionStats)
        return sessionStats
    }

    private updatePromptCacheStats(state: AutoeditRequestState): void {
        if (state.phase !== 'loaded') {
            // Response headers are only available after receiving the response from the model.
            return
        }
        const headers = state.payload.responseHeaders
        const cachedTokens = headers?.['fireworks-cached-prompt-tokens']
        const totalTokens = headers?.['fireworks-prompt-tokens']
        if (!cachedTokens || !totalTokens) {
            return
        }
        const currentRequestHitRate = (Number(cachedTokens) / Number(totalTokens)) * 100
        this.promptCacheReqCount++
        this.promptCacheHitRate =
            (this.promptCacheHitRate * (this.promptCacheReqCount - 1) + currentRequestHitRate) /
            this.promptCacheReqCount
    }
}

/**
 * A simple in-memory store for debugging auto-edit requests.
 * Stores the most recent requests in a ring buffer.
 */
export class AutoeditDebugStore implements vscode.Disposable {
    /** Auto-edit requests, stored in reverse chronological order (newest first) */
    private autoeditRequests: AutoeditRequestDebugState[] = []
    /** Maximum number of auto-edit requests to store */
    private maxEntries = 50
    /** Session-wide stats tracker */
    private sessionStatsTracker = SessionStatsTracker.getInstance()
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

        this.sessionStatsTracker.trackRequest(state)
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
            sideBySideDiffDecorationInfo: this.calculateSideBySideDiff(state),
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
        return {
            state,
            updatedAt: Date.now(),
            autoeditsProviderConfig: { ...autoeditsProviderConfig },
            sideBySideDiffDecorationInfo: this.calculateSideBySideDiff(state),
            sessionStats: this.sessionStatsTracker.getCurrentStats(),
            ...baseState,
        }
    }

    private calculateSideBySideDiff(state: AutoeditRequestState): DecorationInfo | undefined {
        return 'prediction' in state
            ? getDecorationInfo(state.codeToReplaceData.codeToRewrite, state.prediction, CHARACTER_REGEX)
            : undefined
    }

    private enforceMaxEntries(): void {
        if (this.autoeditRequests.length > this.maxEntries) {
            this.autoeditRequests = this.autoeditRequests.slice(0, this.maxEntries)
        }
    }

    private notifyChange(): void {
        this.onDidChangeEmitter.fire()
    }

    public getAutoeditRequestDebugStates(): ReadonlyArray<AutoeditRequestDebugState> {
        return this.autoeditRequests
    }

    public dispose(): void {
        this.onDidChangeEmitter.dispose()
    }
}

// Singleton instance
export const autoeditDebugStore = new AutoeditDebugStore()
