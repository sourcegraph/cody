import { describe, expect, it } from 'vitest'
import { ps } from '../../prompt/prompt-string'
import type { Message } from '../../sourcegraph-api'
import { constructGeminiChatMessages } from './utils'

describe('constructGeminiChatMessages', () => {
    it('should return an empty array when given an empty array', async () => {
        const messages: Message[] = []
        const result = await constructGeminiChatMessages(messages)
        expect(result).toEqual([])
    })

    it('should convert human messages to user role', async () => {
        const messages: Message[] = [{ speaker: 'human', text: ps`Hello` }]
        const result = await constructGeminiChatMessages(messages)
        expect(result).toEqual([{ role: 'user', parts: [{ text: 'Hello' }] }])
    })

    it('should convert model messages to model role when last message is not from bot', async () => {
        const messages: Message[] = [
            { speaker: 'human', text: ps`One` },
            { speaker: 'assistant', text: ps`Two` },
            { speaker: 'human', text: ps`Three` },
        ]
        const result = await constructGeminiChatMessages(messages)
        expect(result).toEqual([
            { role: 'user', parts: [{ text: 'One' }] },
            { role: 'model', parts: [{ text: 'Two' }] },
            { role: 'user', parts: [{ text: 'Three' }] },
        ])
    })

    it('should handle messages with no text', async () => {
        const messages: Message[] = [{ speaker: 'human', text: undefined }]
        const result = await constructGeminiChatMessages(messages)
        expect(result).toEqual([{ role: 'user', parts: [{ text: '' }] }])
    })

    it('should filter out trailing model message', async () => {
        const messages: Message[] = [
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi` },
        ]
        const result = await constructGeminiChatMessages(messages)
        expect(result).toEqual([{ role: 'user', parts: [{ text: 'Hello' }] }])
    })
})
