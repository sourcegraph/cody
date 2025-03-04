import { EventEmitter } from 'vscode'

import type { AutoeditRequestState } from '../analytics-logger/types'

/**
 * Enhanced debug entry for auto-edit requests that extends the analytics logger state
 * with additional debug-specific properties.
 */
export interface AutoeditRequestDebugState {
    /** The underlying analytics logger state object */
    state: AutoeditRequestState
    /** Timestamp when the status was last updated */
    updatedAt: number
}

/**
 * A simple in-memory store for debugging auto-edit requests.
 * Stores the most recent requests in a ring buffer.
 */
export class AutoeditDebugStore {
    /** Auto-edit requests, stored in reverse chronological order (newest first) */
    private autoeditRequests: AutoeditRequestDebugState[] = []
    /** Maximum number of auto-edit requests to store */
    private maxEntries = 50
    /** Event emitter for notifying when data changes */
    private readonly onDidChangeEmitter = new EventEmitter<void>()
    /** Event that fires when the auto-edit requests data changes */
    public readonly onDidChange = this.onDidChangeEmitter.event

    /**
     * Add a new auto-edit request debug state to the store.
     * If the store is full, the oldest entry will be removed.
     */
    public addAutoeditRequestDebugState(state: AutoeditRequestState): void {
        const now = Date.now()

        // Check if this entry already exists
        const existingIndex = this.autoeditRequests.findIndex(e => e.state.requestId === state.requestId)
        if (existingIndex !== -1) {
            // Update existing entry
            this.autoeditRequests[existingIndex] = {
                state,
                updatedAt: now,
            }
            // Notify listeners about the change
            this.onDidChangeEmitter.fire()
            return
        }

        // Add new entry at the beginning (newest first)
        this.autoeditRequests.unshift({
            state,
            updatedAt: now,
        })

        // Remove oldest entries if we exceed max size
        if (this.autoeditRequests.length > this.maxEntries) {
            this.autoeditRequests = this.autoeditRequests.slice(0, this.maxEntries)
        }

        // Notify listeners about the change
        this.onDidChangeEmitter.fire()
    }

    /**
     * Get all auto-edit request debug states.
     */
    public getAutoeditRequestDebugStates(): ReadonlyArray<AutoeditRequestDebugState> {
        return this.autoeditRequests
    }

    /**
     * Set the maximum number of auto-edit requests to store.
     */
    public setMaxAutoeditEntries(maxEntries: number): void {
        this.maxEntries = maxEntries
        // Trim the list if needed
        if (this.autoeditRequests.length > this.maxEntries) {
            this.autoeditRequests = this.autoeditRequests.slice(0, this.maxEntries)
        }
        // Notify listeners about the change
        this.onDidChangeEmitter.fire()
    }

    /**
     * Get a specific debug state by request ID
     */
    public getDebugStateById(requestId: string): AutoeditRequestDebugState | undefined {
        return this.autoeditRequests.find(entry => entry.state.requestId === requestId)
    }
}

// Singleton instance
export const autoeditDebugStore = new AutoeditDebugStore()
