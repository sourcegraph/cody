import { describe, expect, it } from 'vitest'
import { ps } from '../prompt/prompt-string'
import type { Message } from '../sourcegraph-api'
import { constructGeminiChatMessages } from './utils'

describe('constructGeminiChatMessages', () => {
    it('should return an empty array when given an empty array', () => {
        const messages: Message[] = []
        const result = constructGeminiChatMessages(messages)
        expect(result).toEqual([])
    })

    it('should convert human messages to user role', () => {
        const messages: Message[] = [{ speaker: 'human', text: ps`Hello` }]
        const result = constructGeminiChatMessages(messages)
        expect(result).toEqual([{ role: 'user', parts: [{ text: ps`Hello` }] }])
    })

    it('should convert model messages to model role when last message is not from bot', () => {
        const messages: Message[] = [
            { speaker: 'human', text: ps`One` },
            { speaker: 'assistant', text: ps`Two` },
            { speaker: 'human', text: ps`Three` },
        ]
        const result = constructGeminiChatMessages(messages)
        expect(result).toEqual([
            { role: 'user', parts: [{ text: ps`One` }] },
            { role: 'model', parts: [{ text: ps`Two` }] },
            { role: 'user', parts: [{ text: ps`Three` }] },
        ])
    })

    it('should handle messages with no text', () => {
        const messages: Message[] = [{ speaker: 'human', text: undefined }]
        const result = constructGeminiChatMessages(messages)
        expect(result).toEqual([{ role: 'user', parts: [{ text: ps`` }] }])
    })

    it('should filter out trailing model message', () => {
        const messages: Message[] = [
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi` },
        ]
        const result = constructGeminiChatMessages(messages)
        expect(result).toEqual([{ role: 'user', parts: [{ text: ps`Hello` }] }])
    })
})
