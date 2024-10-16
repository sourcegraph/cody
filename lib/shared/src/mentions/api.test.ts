import { describe, expect, it } from 'vitest'
import { firstValueFrom } from '../misc/observable'
import {
    FILE_CONTEXT_MENTION_PROVIDER,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    mentionProvidersMetadata,
} from './api'

describe('mentionProvidersMetadata', () => {
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
