import { type ContextItem, type RangeData, displayPath } from '@sourcegraph/cody-shared'

/**
 * Represents a set of context items that can be added and removed.
 * The set ensures that only valid context items are added, based on a set of rules:
 * - No duplicate items
 * - No items that contain or are contained within an added item with the same display path
 * - Existing user-added items without a range take precedence over new items with the same display path
 * - New items can replace added items with the same display path if the new item's range contains lines in added items
 */
export class ContextSet {
    /**
     * A set of context items that were added.
     */
    private items = new Set<ContextItem>()

    /**
     * Context items that were previously added successfully.
     */
    private readonly history: Set<ContextItem>

    constructor(lastAddedContext: ContextItem[]) {
        this.history = new Set(lastAddedContext)
    }

    public get values(): ContextItem[] {
        return [...this.items]
    }

    /**
     * Adds valid context items to the set.
     *
     * @param item - The context item to add.
     * @returns `true` if the item was successfully added, `false` otherwise.
     */
    public add(item: ContextItem): boolean {
        return this.isValidItem(item) && Boolean(this.items.add(item))
    }

    /**
     * Helper method to checks if a context item is a valid item to add.
     * A context item is valid if:
     * - It is not a duplicate of an existing item.
     * - It does not contain or is contained in an existing item with the same display path.
     *
     * @param item - The context item to check.
     * @returns `true` if the item is valid, `false` otherwise.
     */
    private isValidItem(item: ContextItem): boolean {
        // Skip duplicate items.
        if (this.items.has(item) || this.history.has(item)) {
            return false
        }

        const { range, source, title, uri } = item
        const itemDisplayPath = source === 'unified' ? title : displayPath(uri)

        // Get a list of existing item with the same display path as the new item.
        const existing = [...this.items, ...this.history].filter(i =>
            i.source === 'unified' ? i.title === itemDisplayPath : displayPath(i.uri) === itemDisplayPath
        )

        // If there are no existing items with the same display path, we can add the new item.
        if (!itemDisplayPath || !existing.length) {
            return true
        }

        // If there's an existing user-added item without a range, it means content from the entire file was added.
        if (existing.some(i => !i.range && i.source === 'user')) {
            return false
        }

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
     * Removes context item from the added list if it is present.
     */
    public remove(contextItem: ContextItem): void {
        this.items.delete(contextItem)
    }

    /**
     * Removes all context items with the given display path from the added list.
     */
    private removeItemByDisplayPath(path: string): void {
        for (const item of this.items) {
            if (item.source === 'unified' ? item.title === path : displayPath(item.uri) === path) {
                this.items.delete(item)
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
