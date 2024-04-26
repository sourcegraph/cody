import { type ContextItem, type RangeData, displayPath } from '@sourcegraph/cody-shared'
import { SHA256 } from 'crypto-js'

type ContextItemDisplayID = string

export class ContextTracker {
    /**
     * A list of context items that have been successfully tracked and used.
     */
    private store = new Map<ContextItemDisplayID, ContextItem[]>()

    /**
     * A map of context items that are currently being tracked.
     * NOTE: This gets reset after each call to `getTrackedContextItems`.
     */
    private tracking = new Map<ContextItemDisplayID, ContextItem[]>()
    /**
     * A list of context items that are duplicates of items already being tracked.
     * This contains items that are subsets of the tracked items.
     * NOTE: This gets reset after each call to `getTrackedContextItems`.
     */
    private duplicate: ContextItem[] = []

    /**
     * Gets the tracked context items and resets the tracking state.
     *
     * This method adds all tracked items to the store, returns the used and duplicate items,
     * and then resets the tracking and duplicate state.
     *
     * @returns An object containing the used and duplicate context items.
     */
    public get getTrackedContextItems(): {
        used: ContextItem[]
        duplicate: ContextItem[]
    } {
        const result = {
            used: [...this.tracking.values()].flat(),
            duplicate: this.duplicate,
        }

        // Reset the current list of tracking and duplicate items for the next round
        this.tracking = new Map()
        this.duplicate = []

        return result
    }

    /**
     * Handles tracking a valide context item and updating the stores.
     *
     * An item that is a subset of an existing item will not be tracked.
     *
     * @param item - The context item to track.
     * @returns `true` if the item was successfully tracked, `false` otherwise.
     */
    public track(item: ContextItem): boolean {
        const id = this.getContextDisplayID(item)
        const range = item?.range

        const items = this.store.get(id) || []

        if (range) {
            for (let i = 0; i < items.length; i++) {
                const existing = items[i]
                if (existing.range) {
                    // If the item is a subset of the tracked range,
                    // add it to the duplicate list
                    if (isRangeContain(range, existing.range)) {
                        this.duplicate.push(item)
                        return false
                    }
                    // If the item is a superset of the tracked range,
                    // move the tracked item to the duplicate list and update the tracked item
                    if (isRangeContain(existing.range, range)) {
                        this.duplicate.push(existing)
                        items[i] = item
                        return true
                    }
                }
            }
        } else if (items.length > 0) {
            this.duplicate.push(item)
            return false
        }

        items.push(item)
        this.store.set(id, items)
        this.tracking.set(id, items)
        return true
    }

    /**
     * Removes a context item from the current tracking state.
     */
    public untrack(contextItem: ContextItem): void {
        const id = this.getContextDisplayID(contextItem)
        const items = this.tracking.get(id)
        if (items) {
            const index = items.indexOf(contextItem)
            if (index >= 0) {
                items.splice(index, 1)
                if (items.length === 0) {
                    /// If the list of items becomes empty,
                    // remove the key from the trackers.
                    this.tracking.delete(id)
                    this.store.delete(id)
                }
            }
        }
    }

    /**
     * Generates an idenifier for a context item based on its source and content.
     */
    public getContextDisplayID(item: ContextItem): ContextItemDisplayID {
        if (item.source === 'terminal' || item.source === 'uri') {
            return `${displayPath(item.uri)}#${SHA256(item.content ?? '').toString()}`
        }

        return (item.source === 'unified' && item.title) || displayPath(item.uri)
    }
}

/**
 * Compare two ranges to determine if the first range is contained in the second range.
 */
function isRangeContain(r1: RangeData, r2: RangeData): boolean {
    return r1.start.line >= r2.start.line && r1.end.line <= r2.end.line
}
