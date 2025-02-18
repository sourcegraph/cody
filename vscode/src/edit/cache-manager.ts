import { LRUCache } from 'lru-cache'

import type { getSmartApplySelection } from './prompt/smart-apply'
import type { StreamSession } from './provider'

type SelectionPromise = Promise<ReturnType<typeof getSmartApplySelection>>

export interface CacheEntry {
    selectionPromise?: SelectionPromise
    streamSession?: StreamSession
}

export class EditCacheManager {
    private cache = new LRUCache<string, CacheEntry>({ max: 20 })

    public getSelectionPromise(id: string): SelectionPromise | undefined {
        const entry = this.cache.get(id)
        if (entry) {
            return entry.selectionPromise
        }
        return undefined
    }

    public setSelectionPromise(id: string, promise: SelectionPromise): void {
        const entry = this.cache.get(id) || {}
        entry.selectionPromise = promise
        this.cache.set(id, entry)
    }

    public getStreamSession(id: string): StreamSession | undefined {
        const entry = this.cache.get(id)
        if (entry) {
            return entry.streamSession
        }
        return undefined
    }

    public setStreamSession(id: string, session: StreamSession): void {
        const entry = this.cache.get(id) || {}
        entry.streamSession = session
        this.cache.set(id, entry)
    }

    public delete(id: string): void {
        const entry = this.cache.get(id)
        if (entry?.streamSession) {
            entry.streamSession.abortController.abort()
        }
        this.cache.delete(id)
    }
}
