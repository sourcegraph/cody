import { type ContextItem, type RangeData, displayPath } from '@sourcegraph/cody-shared'
import { SHA256 } from 'crypto-js'

type ContextItemID = string

export class ContextTracker {
    private store = new Map<ContextItemID, ContextItem[]>()
    private duplicate: ContextItem[] = []

    public get usedContextItems(): { used: ContextItem[]; duplicate: ContextItem[] } {
        return { used: [...this.store.values()].flat(), duplicate: this.duplicate }
    }

    /**
     * Tracks a context item in the context tracker.
     *
     * If the context item's range is contained within an existing tracked range, the item is added to the duplicate list and `false` is returned.
     * If the context item's range contains an existing tracked range, the existing item is moved to the duplicate list and the new item is tracked.
     * Otherwise, the new item is added to the tracked items and `true` is returned.
     *
     * @param item - The context item to track.
     * @returns `true` if the item was successfully tracked, `false` otherwise.
     */
    public track(item: ContextItem): boolean {
        const id = this.getContextItemId(item)
        const range = item?.range

        const items = this.store.get(id) || []

        if (range) {
            for (let i = 0; i < items.length; i++) {
                const existing = items[i]
                if (existing.range) {
                    // If the item is a subset of the tracked range,
                    // add it to the duplicate list
                    if (isRangeContained(range, existing.range)) {
                        this.duplicate.push(item)
                        return false
                    }
                    // If the item is a superset of the tracked range,
                    // move the tracked item to the duplicate list and update the tracked item
                    if (isRangeContained(existing.range, range)) {
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

    public untrack(contextItem: ContextItem): void {
        /// If the ContextItem is found in the store, it is removed from the list of items associated with its ID.
        /// If the list of items becomes empty after removing the ContextItem, the ID is also removed from the store.
        const id = this.getContextItemId(contextItem)
        const items = this.store.get(id)
        if (items) {
            const index = items.indexOf(contextItem)
            if (index >= 0) {
                items.splice(index, 1)
                if (items.length === 0) {
                    this.store.delete(id)
                }
            }
        }
    }

    public getContextItemId(item: ContextItem): ContextItemID {
        if (item.source === 'terminal' || item.source === 'uri') {
            return `${displayPath(item.uri)}#${SHA256(item.content ?? '').toString()}`
        }

        return (item.source === 'unified' && item.title) || displayPath(item.uri)
    }
}

// Check if r1 is contained in r2
function isRangeContained(r1: RangeData, r2: RangeData): boolean {
    return r1.start.line >= r2.start.line && r1.end.line <= r2.end.line
}
