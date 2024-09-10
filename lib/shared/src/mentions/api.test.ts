import type { Observable } from 'observable-fns'
import { describe, expect, it } from 'vitest'
import {
    FILE_CONTEXT_MENTION_PROVIDER,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    mentionProvidersMetadata,
} from './api'

function waitForObservable<T>(observable: Observable<T>): Promise<T> {
    return new Promise<T>(resolve => {
        const subscription = observable.subscribe(value => {
            resolve(value)
            subscription.unsubscribe()
        })
    })
}

describe('mentionProvidersMetadata', () => {
    it('should return all providers when no options are provided', async () => {
        const providers = await waitForObservable(mentionProvidersMetadata())
        expect(providers.length).toBeGreaterThanOrEqual(2)
    })
    it('should filter out disabled providers', async () => {
        const options = { disableProviders: [FILE_CONTEXT_MENTION_PROVIDER.id] }
        const providers = await waitForObservable(mentionProvidersMetadata(options))
        expect(providers.length).toBeGreaterThanOrEqual(1)
        expect(providers).toContain(SYMBOL_CONTEXT_MENTION_PROVIDER)
        expect(providers).not.toContain(FILE_CONTEXT_MENTION_PROVIDER)
    })

    it('should handle empty disableProviders array', async () => {
        const options = { disableProviders: [] }
        const providers = await waitForObservable(mentionProvidersMetadata(options))
        expect(providers.length).toBeGreaterThanOrEqual(2)
        expect(providers).toContain(SYMBOL_CONTEXT_MENTION_PROVIDER)
        expect(providers).toContain(FILE_CONTEXT_MENTION_PROVIDER)
    })
})
