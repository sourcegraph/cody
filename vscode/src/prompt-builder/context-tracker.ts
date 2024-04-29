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
     * Adds a context item to the tracking list only if it is not a subset of an used items.
     *
     * @param item - The context item to track.
     * @returns `true` if the item was successfully tracked, `false` otherwise.
     */
    public add(item: ContextItem): boolean {
        return this.isTrackable(item) && Boolean(this.tracking.add(item))
    }

    /**
     * Helper method to checks if a context item is trackable or not.
     *
     * @param item - The context item to check.
     * @returns `true` if the item is trackable, `false` otherwise.
     */
    private isTrackable(item: ContextItem): boolean {
        // Skip duplicate items.
        if (this.tracking.has(item) || this.history.has(item)) {
            return false
        }

        const { range, source, title, uri } = item
        const itemDisplayPath = source === 'unified' ? title : displayPath(uri)

        // Get a list of existing item with the same display path as the new item.
        const existing = [...this.tracking, ...this.history].filter(i =>
            i.source === 'unified' ? i.title === itemDisplayPath : displayPath(i.uri) === itemDisplayPath
        )

        // If there are no existing items with the same display path, the item is trackable.
        if (!itemDisplayPath || !existing.length) {
            return true
        }

        // If there's an existing user-added item without a range, it means content from the entire file was added.
        if (existing.some(i => !i.range && i.source === 'user')) {
            return false
        }

        // If the item has no range, it means we are adding content from the entire file.
        if (!range) {
            if (source === 'user') {
                // Remove existing items with the same display path.
                this.removeItemByDisplayPath(itemDisplayPath)
            }
            return true
        }

        // Check if the new range contains or is contained in an existing range
        const containsExisting = existing.some(i => i.range && rangeContainsLines(range, i.range))
        if (containsExisting) {
            this.removeItemByDisplayPath(itemDisplayPath)
            return true
        }

        // Check if range is contained in exisiting items.
        return !existing.some(i => i.range && rangeContainsLines(i.range, range))
    }

    /**
     * Removes context item from the tracking list if it is present.
     */
    public remove(contextItem: ContextItem): void {
        this.tracking.delete(contextItem)
    }

    /**
     * Removes all context items with the given display path from the tracking list.
     */
    private removeItemByDisplayPath(path: string): void {
        for (const item of this.tracking) {
            if (item.source === 'unified' ? item.title === path : displayPath(item.uri) === path) {
                this.tracking.delete(item)
            }
        }
    }
}

/**
 * Checks if the haystack range contains the lines in the needle range.
 */
function rangeContainsLines(haystack: RangeData, needle: RangeData): boolean {
    return haystack.start.line <= needle.start.line && haystack.end.line >= needle.end.line
}
