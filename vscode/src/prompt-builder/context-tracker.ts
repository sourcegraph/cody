import { type ContextItem, type RangeData, displayPath } from '@sourcegraph/cody-shared'
import { SHA256 } from 'crypto-js'

type ContextItemDisplayID = string

export class ContextTracker {
    /**
     * A map of context items that are currently being tracked.
     */
    private store = new Map<ContextItemDisplayID, ContextItem[]>()
    /**
     * A list of context items that are duplicates of items already being tracked.
     * This contains items that are subsets of the tracked items.
     */
    private duplicate: ContextItem[] = []

    /**
     * The final list of context items that are being used.
     */
    public get usedContextItems(): { used: ContextItem[]; duplicate: ContextItem[] } {
        return { used: [...this.store.values()].flat(), duplicate: this.duplicate }
    }

    /**
     * Handles tracking a valide context item and updating the store.
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
        return true
    }

    /**
     * Removes a context item from the context tracker store.
     */
    public untrack(contextItem: ContextItem): void {
        const id = this.getContextDisplayID(contextItem)
        const items = this.store.get(id)
        if (items) {
            const index = items.indexOf(contextItem)
            if (index >= 0) {
                items.splice(index, 1)
                if (items.length === 0) {
                    /// If the list of items becomes empty,
                    // remove the key from the store
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
