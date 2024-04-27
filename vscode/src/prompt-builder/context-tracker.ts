import { type ContextItem, type RangeData, displayPath } from '@sourcegraph/cody-shared'
import { SHA256 } from 'crypto-js'

type ContextTrackerID = string

export class ContextTracker {
    /**
     * A map to store the history of tracked context items, keyed by a unique identifier.
     */
    private history = new Map<ContextTrackerID, ContextItem[]>()

    /**
     * A temporary list to store the context items being tracked in the current iteration.
     */
    private current: ContextItem[] = []

    /**
     * Retrieves the context items tracked in the current iteration and resets the current state.
     */
    public get getAndResetTrackedItems(): ContextItem[] {
        const tracked = this.current
        this.current = [] // Reset the current state for the next iteration
        return tracked
    }

    /**
     * Tracks a context item if it is not a subset of an existing tracked item.
     *
     * If the new item's range contains any existing item's range, it replaces the existing item(s).
     *
     * @param item - The context item to track.
     * @returns `true` if the item was successfully tracked, `false` otherwise.
     */
    public track(item: ContextItem): boolean {
        const id = this.getID(item)
        const range = item?.range

        const items = this.history.get(id) || []

        if (range) {
            // Filter the existing items to get only those with ranges.
            const existingRanges = items.filter(i => i.range).map(i => i.range)
            // Check if the new range is contained within any of the existing ranges.
            const isContainedInExisting = existingRanges.some(r => r && isRangeContain(range, r))
            // Check if the new range contains any of the existing ranges.
            const isContainingExisting = existingRanges.some(r => r && isRangeContain(r, range))

            if (isContainedInExisting) {
                return false
            }
            // If the new range contains any existing range, replace the tracked items with the new item.
            if (isContainingExisting) {
                this.history.set(id, [item])
                this.current = [item]
                return true
            }
        } else if (items.length > 0) {
            return false
        }

        items.push(item)
        this.history.set(id, items)
        this.current.push(item)
        return true
    }

    /**
     * Removes a context item from the tracked items.
     */
    public untrack(contextItem: ContextItem): void {
        const id = this.getID(contextItem)
        const items = this.history.get(id) || []
        const index = items.indexOf(contextItem)
        if (index !== -1) {
            items.splice(index, 1)
            this.history.set(id, items)
            this.current = this.current.filter(item => item !== contextItem)
        }
    }

    /**
     * Generates a unique identifier for a context item based on its source and content.
     */
    public getID(item: ContextItem): ContextTrackerID {
        if (item.source === 'terminal' || item.source === 'uri') {
            return `${displayPath(item.uri)}#${SHA256(item.content ?? '').toString()}`
        }

        return (item.source === 'unified' && item.title) || displayPath(item.uri)
    }
}

/**
 * Checks if the first range is fully contained within the second range.
 */
function isRangeContain(r1: RangeData, r2: RangeData): boolean {
    return r1.start.line >= r2.start.line && r1.end.line <= r2.end.line
}
