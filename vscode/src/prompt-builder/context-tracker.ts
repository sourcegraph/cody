import { type ContextItem, type RangeData, displayPath } from '@sourcegraph/cody-shared'
import { SHA256 } from 'crypto-js'

type ContextItemID = string

export class ContextTracker {
    /**
     * Tracks the context items that are being used in the prompt.
     * If a context item has no range, we assume it contains content from the entire file.
     */
    private tracked = new Map<ContextItemID, RangeData[]>()

    /**
     * Tracks a context item by adding its range to the list of tracked ranges for the item's identifier.
     * If the item's range is already contained within an existing tracked range, the item is not tracked.
     *
     * @param item - The context item to be tracked.
     * @returns `true` if the item was successfully tracked, `false` otherwise.
     */
    public track(item: ContextItem): boolean {
        const id = this.getContextItemId(item)
        const range = item?.range
        const trackedRanges = this.tracked.get(id)

        if (!range || trackedRanges?.length === 0) {
            this.tracked.set(id, [])
            return trackedRanges?.length !== 0
        }

        // Check if the new range is contained within any existing tracked range
        if (trackedRanges?.some(r => isRangeContained(r, range))) {
            return false
        }

        trackedRanges?.push(range)
        return true
    }

    /**
     * Removes the specified context item from the tracked items.
     *
     * If the context item has no associated range, the entire item is removed from the tracking.
     * Otherwise, the range associated with the context item is removed from the tracked ranges.
     * If the removal of the range results in no more ranges being tracked for the context item,
     * the entire item is removed from the tracking.
     *
     * @param contextItem - The context item to be removed from the tracking.
     */
    public untrack(contextItem: ContextItem): void {
        const id = this.getContextItemId(contextItem)
        const range = contextItem.range
        if (!range) {
            this.tracked.delete(id)
            return
        }

        const trackedRanges = this.tracked.get(id)
        if (trackedRanges) {
            const index = trackedRanges.findIndex(r => isRangeEqual(r, range))
            if (index !== -1) {
                trackedRanges.splice(index, 1)
                if (trackedRanges.length === 0) {
                    this.tracked.delete(id)
                }
            }
        }
    }

    /**
     * Generates a unique identifier for a given context item based on its source and content.
     *
     * @param item - The context item for which to generate an identifier.
     * @returns A unique identifier for the context item.
     */
    public getContextItemId(item: ContextItem): ContextItemID {
        // Use the URI and content hash as the identifier for non-codebase context items
        if (item.source === 'terminal' || item.source === 'uri') {
            return `${item.uri.toString()}#${SHA256(item.content ?? '').toString()}`
        }

        // Unified context items have a `title` property that we used as display path
        return (item.source === 'unified' && item.title) || displayPath(item.uri)
    }
}

function isRangeContained(r1: RangeData, r2: RangeData): boolean {
    return r1.start.line <= r2.start.line && r1.end.line >= r2.end.line
}

function isRangeEqual(r1: RangeData, r2: RangeData): boolean {
    return r1.start.line === r2.start.line && r1.end.line === r2.end.line
}
