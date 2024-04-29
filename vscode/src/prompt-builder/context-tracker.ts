import { type ContextItem, type RangeData, displayPath } from '@sourcegraph/cody-shared'

export class ContextTracker {
    /**
     * Ccontext items that are currently being tracked.
     */
    private tracking = new Set<ContextItem>()

    /**
     * Context items that were previously tracked and added successfully.
     */
    private readonly history: Set<ContextItem>

    constructor(lastAddedContext: ContextItem[]) {
        this.history = new Set(lastAddedContext)
    }

    /**
     * Retrieves the context items that were tracked and added successfully.
     */
    public get added(): ContextItem[] {
        return [...this.tracking]
    }

    /**
     * Removes a context item from the tracking list.
     */
    public remove(contextItem: ContextItem): void {
        this.tracking.delete(contextItem)
    }

    /**
     * Adds a context item to the tracking list only if it is not a subset of an used items.
     *
     * @param item - The context item to track.
     * @returns `true` if the item was successfully tracked, `false` otherwise.
     */
    public add(item: ContextItem): boolean {
        const isItemTrackable = this.isTrackable(item)
        if (isItemTrackable) {
            this.tracking.add(item)
        }

        return isItemTrackable
    }

    /**
     * Helper method to checks if a context item is trackable or not.
     *
     * @param item - The context item to check.
     * @returns `true` if the item is trackable, `false` otherwise.
     */
    private isTrackable(item: ContextItem): boolean {
        if (this.tracking.has(item) || this.history.has(item)) {
            return false
        }

        // Range of the new item.
        const range = item.range
        // Display path of the new item.
        const itemDisplayPath = item.source === 'unified' ? item.title : displayPath(item.uri)
        // Filter the existing items to get only those with the same display path as the new item.
        const existing = [...this.history, ...this.tracking].filter(i =>
            i.source === 'unified' ? i.title === itemDisplayPath : displayPath(i.uri) === itemDisplayPath
        )

        // No existing items are found with the same display path, so the new item is trackable.
        if (!range) {
            return !existing.length
        }

        // Check if the new range contains an existing range.
        const isContainingExisting = existing.some(i => i.range && rangeContainsLines(range, i.range))
        if (isContainingExisting) {
            // If new range contains a range of an tracking item, remove the item from the tracking list.
            const itemToRemove = existing.find(i => i.range && rangeContainsLines(range, i.range))
            if (itemToRemove) {
                this.remove(itemToRemove)
            }
            return true
        }

        // Check if exisiting items contain the new range.
        const isContainedInExisting = existing.some(i => i.range && rangeContainsLines(i.range, range))
        return !isContainedInExisting
    }
}

/**
 * Checks if the haystack range contains the lines in the needle range.
 */
function rangeContainsLines(haystack: RangeData, needle: RangeData): boolean {
    return haystack.start.line <= needle.start.line && haystack.end.line >= needle.end.line
}
