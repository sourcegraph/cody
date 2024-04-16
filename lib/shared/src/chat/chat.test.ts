import { describe, expect, it } from 'vitest'

import { ps } from '../prompt/prompt-string'
import type { Message } from '../sourcegraph-api'
import { sanitizeMessages } from './chat'

const hello = ps`Hello`
const hiThere = ps`Hi there!`
const isAnyoneThere = ps`Is anyone there?`

describe('sanitizeMessages', () => {
    it('removes empty assistant messages and the human question before it', () => {
        const messages = [
            { speaker: 'human', text: hello },
            { speaker: 'assistant' },
            { speaker: 'human', text: isAnyoneThere },
        ] satisfies Message[]

        const expected = [{ speaker: 'human', text: isAnyoneThere }]

        const result = sanitizeMessages(messages)

        expect(result).toEqual(expected)
    })

    it('removes trailing empty assistant message', () => {
        const messages = [
            { speaker: 'human', text: hello },
            { speaker: 'assistant', text: hiThere },
            { speaker: 'assistant' },
        ] satisfies Message[]

        const expected = [
            { speaker: 'human', text: hello },
            { speaker: 'assistant', text: hiThere },
        ]

        const result = sanitizeMessages(messages)

        expect(result).toEqual(expected)
    })

    it('returns original when no empty messages', () => {
        const messages = [
            { speaker: 'human', text: hello },
            { speaker: 'assistant', text: hiThere },
        ] satisfies Message[]

        const result = sanitizeMessages(messages)

        expect(result).toEqual(messages)
    })
})
