import { useCallback, useSyncExternalStore } from 'react'
import type { AutoeditHotStreakID } from '../../../src/autoedits/analytics-logger/types'
import type { AutoeditRequestDebugState } from '../../../src/autoedits/debug-panel/debug-store'

// Define the store interface
interface HotStreakStore {
    subscribe: (callback: () => void) => () => void
    getSnapshot: () => Map<string, AutoeditRequestDebugState[]>
    setEntries: (entries: AutoeditRequestDebugState[]) => void
    getHotStreakChainForId: (
        hotStreakId: AutoeditHotStreakID | null | undefined
    ) => AutoeditRequestDebugState[]
}

// Create the store instance
const createHotStreakStore = (): HotStreakStore => {
    let map = new Map<string, AutoeditRequestDebugState[]>()
    const listeners = new Set<() => void>()

    const subscribe = (callback: () => void) => {
        listeners.add(callback)
        return () => listeners.delete(callback)
    }

    const notify = () => {
        for (const listener of listeners) {
            listener()
        }
    }

    // Compute the hot streak map from entries
    const computeHotStreakMap = (entries: AutoeditRequestDebugState[]) => {
        const newMap = new Map<string, AutoeditRequestDebugState[]>()

        // First pass: collect all hot streak IDs
        for (const entry of entries) {
            if ('hotStreakId' in entry.state && entry.state.hotStreakId) {
                const hotStreakId = entry.state.hotStreakId
                if (!newMap.has(hotStreakId)) {
                    newMap.set(hotStreakId, [])
                }
                newMap.get(hotStreakId)!.push(entry)
            }
        }

        // Second pass: sort each group of entries by editPosition
        for (const [_, hotStreakEntries] of newMap.entries()) {
            hotStreakEntries.sort((a, b) => {
                const posA =
                    'editPosition' in a.state ? a.state.editPosition.line : a.state.position.line
                const posB =
                    'editPosition' in b.state ? b.state.editPosition.line : b.state.position.line

                if (posA === posB) {
                    return a.state.startedAt - b.state.startedAt
                }

                return posA - posB
            })
        }

        return newMap
    }

    return {
        subscribe,
        getSnapshot: () => map,
        setEntries: (entries: AutoeditRequestDebugState[]) => {
            map = computeHotStreakMap(entries)
            notify()
        },
        getHotStreakChainForId: (hotStreakId: AutoeditHotStreakID | null | undefined) => {
            if (!hotStreakId) return []
            return map.get(hotStreakId) || []
        },
    }
}

// Create a singleton instance
const hotStreakStore = createHotStreakStore()

// Hook to use the store
export const useHotStreakStore = () => {
    const hotStreakMap = useSyncExternalStore(hotStreakStore.subscribe, hotStreakStore.getSnapshot)

    const getHotStreakChainForId = useCallback(
        (hotStreakId: AutoeditHotStreakID | null | undefined) =>
            hotStreakStore.getHotStreakChainForId(hotStreakId),
        []
    )

    return {
        hotStreakMap,
        setEntries: hotStreakStore.setEntries,
        getHotStreakChainForId,
    }
}
