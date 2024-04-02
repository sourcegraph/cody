import { describe, expect, it } from 'vitest'

import { ps } from '../prompt/prompt-string'
import type { Message } from '../sourcegraph-api'
import { sanitizeMessages } from './chat'

describe('sanitizeMessages', () => {
    it('removes empty assistant messages and the human question before it', () => {
        const messages = [
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant' },
            { speaker: 'human', text: ps`Is anyone there?` },
        ] satisfies Message[]

        const expected = [{ speaker: 'human', text: 'Is anyone there?' }]

        const result = sanitizeMessages(messages)

        expect(result).toEqual(expected)
    })

    it('removes trailing empty assistant message', () => {
        const messages = [
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi there!` },
            { speaker: 'assistant' },
        ] satisfies Message[]

        const expected = [
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi there!` },
        ]

        const result = sanitizeMessages(messages)

        expect(result).toEqual(expected)
    })

    it('returns original when no empty messages', () => {
        const messages = [
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi there!` },
        ] satisfies Message[]

        const result = sanitizeMessages(messages)

        expect(result).toEqual(messages)
    })
})
