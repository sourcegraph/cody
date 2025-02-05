import { Observable } from 'observable-fns'
import { describe, expect, it, vi } from 'vitest'
import * as openctxAPI from '../context/openctx/api'
import { firstValueFrom } from '../misc/observable'
import {
    FILE_CONTEXT_MENTION_PROVIDER,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    mentionProvidersMetadata,
} from './api'

describe('mentionProvidersMetadata', () => {
    vi.spyOn(openctxAPI, 'openctxController', 'get').mockReturnValue(
        Observable.of({
            metaChanges: () => Observable.of([]),
        } satisfies Pick<
            openctxAPI.OpenCtxController,
            'metaChanges'
        > as unknown as openctxAPI.OpenCtxController)
    )

    it('should return all providers when no options are provided', async () => {
        const providers = await firstValueFrom(mentionProvidersMetadata())
        expect(providers.length).toBeGreaterThanOrEqual(2)
    })
    it('should filter out disabled providers', async () => {
        const options = { disableProviders: [FILE_CONTEXT_MENTION_PROVIDER.id] }
        const providers = await firstValueFrom(mentionProvidersMetadata(options))
        expect(providers.length).toBeGreaterThanOrEqual(1)
        expect(providers).toContain(SYMBOL_CONTEXT_MENTION_PROVIDER)
        expect(providers).not.toContain(FILE_CONTEXT_MENTION_PROVIDER)
    })

    it('should handle empty disableProviders array', async () => {
        const options = { disableProviders: [] }
        const providers = await firstValueFrom(mentionProvidersMetadata(options))
        expect(providers.length).toBeGreaterThanOrEqual(2)
        expect(providers).toContain(SYMBOL_CONTEXT_MENTION_PROVIDER)
        expect(providers).toContain(FILE_CONTEXT_MENTION_PROVIDER)
    })
})
