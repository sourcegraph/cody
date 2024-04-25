import { type ContextItem, type RangeData, displayPath } from '@sourcegraph/cody-shared'
import { SHA256 } from 'crypto-js'

type ContextItemID = string

export class ContextTracker {
    private fullFileStore = new Map<ContextItemID, ContextItem>()
    private tracked = new Map<ContextItemID, ContextItem[]>()
    // The items that were duplicates of previously seen items
    private duplicate: ContextItem[] = []

    public get usedContextItems(): { used: ContextItem[]; duplicate: ContextItem[] } {
        // The items that were successfully added
        const used = [...this.fullFileStore.values()].concat(...this.tracked.values())
        return { used, duplicate: this.duplicate }
    }

    public track(item: ContextItem): boolean {
        const id = this.getContextItemId(item)
        if (this.fullFileStore.has(id)) {
            this.duplicate.push(item)
            return false
        }

        const range = item?.range
        if (!range) {
            this.fullFileStore.set(id, item)
            this.tracked.delete(id)
            return true
        }

        const trackedItems = this.tracked.get(id)
        if (!trackedItems) {
            this.tracked.set(id, [item])
            return true
        }

        for (const tracked of trackedItems) {
            const trackedRange = tracked.range!
            if (isRangeContained(range, trackedRange)) {
                this.duplicate.push(item)
                return false
            }
            if (isRangeContained(trackedRange, range)) {
                const index = trackedItems.indexOf(tracked)
                trackedItems.splice(index, 1)
                this.duplicate.push(item)
                trackedItems.push(item)
                return false
            }
        }

        trackedItems.push(item)
        return true
    }

    public untrack(contextItem: ContextItem): void {
        const id = this.getContextItemId(contextItem)
        const range = contextItem.range
        if (!range) {
            this.fullFileStore.delete(id)
            return
        }

        const trackedItems = this.tracked.get(id)
        if (trackedItems) {
            const index = trackedItems.findIndex(i => isRangeEqual(i.range!, range))
            if (index !== -1) {
                trackedItems.splice(index, 1)
                if (trackedItems.length === 0) {
                    this.tracked.delete(id)
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

function isRangeEqual(r1: RangeData, r2: RangeData): boolean {
    return r1.start.line === r2.start.line && r1.end.line === r2.end.line
}

function isRangeContained(r1: RangeData, r2: RangeData): boolean {
    return r1.start.line >= r2.start.line && r1.end.line <= r2.end.line
}
