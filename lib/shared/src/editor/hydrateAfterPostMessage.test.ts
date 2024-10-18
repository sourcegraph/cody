import { describe, expect, test } from 'vitest'

import { ps } from '../prompt/prompt-string'
import { isValueSafeForPostMessage } from './hydrateAfterPostMessage'

describe('forceHydration', () => {
    test('handles PromptString', async () => {
        const ps1 = ps`foo`
        expect(ps1.toJSON()).toBe('foo')
        expect(isValueSafeForPostMessage(ps1).toJSON()).toBe('foo')
    })
})
