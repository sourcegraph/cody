import { describe, expect, it } from 'vitest'
import type { Message } from '../../sourcegraph-api'
import { constructGeminiChatMessages } from './utils'

describe('constructGeminiChatMessages', () => {
    it('should return an empty array when given an empty array', () => {
        const messages: Message[] = []
        const result = constructGeminiChatMessages(messages)
        expect(result).toEqual([])
    })

    it('should convert human messages to user role', () => {
        const messages: Message[] = [{ speaker: 'human', text: 'Hello' }]
        const result = constructGeminiChatMessages(messages)
        expect(result).toEqual([{ role: 'user', parts: [{ text: 'Hello' }] }])
    })

    it('should convert model messages to model role when last message is not from bot', () => {
        const messages: Message[] = [
            { speaker: 'human', text: 'One' },
            { speaker: 'assistant', text: 'Two' },
            { speaker: 'human', text: 'Three' },
        ]
        const result = constructGeminiChatMessages(messages)
        expect(result).toEqual([
            { role: 'user', parts: [{ text: 'One' }] },
            { role: 'model', parts: [{ text: 'Two' }] },
            { role: 'user', parts: [{ text: 'Three' }] },
        ])
    })

    it('should handle messages with no text', () => {
        const messages: Message[] = [{ speaker: 'human', text: undefined }]
        const result = constructGeminiChatMessages(messages)
        expect(result).toEqual([{ role: 'user', parts: [{ text: '' }] }])
    })

    it('should filter out trailing model message', () => {
        const messages: Message[] = [
            { speaker: 'human', text: 'Hello' },
            { speaker: 'assistant', text: 'Hi' },
        ]
        const result = constructGeminiChatMessages(messages)
        expect(result).toEqual([{ role: 'user', parts: [{ text: 'Hello' }] }])
    })
})
