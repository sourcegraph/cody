import { type ContextItem, type RangeData, displayPath } from '@sourcegraph/cody-shared'
import { SHA256 } from 'crypto-js'

type ContextItemDisplayID = string

export class ContextTracker {
    /**
     * A list of context items that have been successfully tracked and used.
     */
    private store = new Map<ContextItemDisplayID, ContextItem[]>()

    /**
     * A map of context item display IDs to the list of items that are being tracked.
     * NOTE: This gets reset after each call to `getTrackedContextItems`
     */
    private tracking = new Map<ContextItemDisplayID, ContextItem[]>()

    /**
     * Gets the tracked context items and resets the current tracking state.
     *
     * @returns An object containing the used and duplicate context items.
     */
    public get getTrackedContextItems(): ContextItem[] {
        const used = [...this.tracking.values()].flat()
        // Reset the current tracking state for the next round
        this.tracking = new Map()
        return used
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
                    // Do not track item that is a subset of the tracked range
                    if (isRangeContain(range, existing.range)) {
                        return false
                    }
                    // If the item is a superset of a tracked range,
                    // replace the current tracked item with the new item
                    if (isRangeContain(existing.range, range)) {
                        items[i] = item
                        return true
                    }
                }
            }
        } else if (items.length > 0) {
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
        const removeFromTracker = (arr: ContextItem[]) => {
            const index = arr.indexOf(contextItem)
            if (index !== -1) {
                arr.splice(index, 1)
            }
        }

        removeFromTracker(this.tracking.get(id) ?? [])
        removeFromTracker(this.store.get(id) ?? [])
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
