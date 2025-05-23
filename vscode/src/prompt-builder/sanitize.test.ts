import { type ChatMessage, ps } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import { sanitizedChatMessages } from './sanitize'

describe('sanitizedChatMessages', () => {
    it('should handle empty messages array', () => {
        const messages: ChatMessage[] = []
        const result = sanitizedChatMessages(messages)
        expect(result).toEqual([])
    })

    it('should process messages with no content', () => {
        const messages: ChatMessage[] = [
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi there` },
        ]
        const result = sanitizedChatMessages(messages)
        expect(result).toEqual(messages)
    })

    it('should remove content between <think> tags in first human message', () => {
        const messages: ChatMessage[] = [
            { speaker: 'human', text: ps`<think>This should be removed</think>Keep this text` },
            { speaker: 'assistant', text: ps`Response` },
        ]
        const result = sanitizedChatMessages(messages)
        expect(result[0].text).toEqual('Keep this text')
    })

    it('should only process <think> tags if they start at the beginning of the message', () => {
        const messages: ChatMessage[] = [
            { speaker: 'human', text: ps`Text before <think>This should not be removed</think>` },
            { speaker: 'assistant', text: ps`Response` },
        ]
        const result = sanitizedChatMessages(messages)
        expect(result[0].text).toEqual(ps`Text before <think>This should not be removed</think>`)
    })

    it('should handle multiple <think> tags if the first one starts at the beginning', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'human',
                text: ps`<think>Remove this</think>Keep\n\nthis<think>And \nalso this \n</think>`,
            },
            { speaker: 'assistant', text: ps`Response` },
        ]
        const result = sanitizedChatMessages(messages)
        expect(result[0].text).toEqual('Keep\n\nthis<think>And \nalso this \n</think>')
    })

    it('should not modify human message without <think> tags', () => {
        const messages: ChatMessage[] = [
            { speaker: 'human', text: ps`This message has no think tags` },
            { speaker: 'assistant', text: ps`Response` },
        ]
        const result = sanitizedChatMessages(messages)
        expect(result[0].text).toEqual(ps`This message has no think tags`)
    })

    it('should remove tool_call from human messages', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'human',
                content: [
                    { type: 'text', text: 'Hello' },
                    { type: 'tool_call', tool_call: { id: '123', name: 'test', arguments: '{}' } },
                ],
            },
        ]
        const result = sanitizedChatMessages(messages)
        expect(result[0].content).toEqual([{ type: 'text', text: 'Hello' }])
    })

    it('should remove tool_result from assistant messages', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'assistant',
                content: [
                    { type: 'text', text: 'Hello' },
                    { type: 'tool_result', tool_result: { id: '123', content: 'test result' } },
                ],
            },
        ]
        const result = sanitizedChatMessages(messages)
        expect(result[0].content).toEqual([{ type: 'text', text: 'Hello' }])
    })

    it('should remove tool_call from assistant message if next human message has no tool_result', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'assistant',
                content: [
                    { type: 'text', text: 'I can help with that' },
                    { type: 'tool_call', tool_call: { id: '123', name: 'test', arguments: '{}' } },
                ],
            },
            {
                speaker: 'human',
                content: [{ type: 'text', text: 'Thanks, but I changed my mind' }],
            },
        ]
        const result = sanitizedChatMessages(messages)

        // The tool_call should be removed from the assistant message
        expect(result[0].content).toEqual([{ type: 'text', text: 'I can help with that' }])

        // The human message should remain unchanged
        expect(result[1].content).toEqual([{ type: 'text', text: 'Thanks, but I changed my mind' }])
    })

    it('should keep tool_call in assistant message if next human message has tool_result', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'assistant',
                content: [
                    { type: 'text', text: 'I can help with that' },
                    { type: 'tool_call', tool_call: { id: '123', name: 'test', arguments: '{}' } },
                ],
            },
            {
                speaker: 'human',
                content: [
                    { type: 'text', text: 'Here is the result' },
                    { type: 'tool_result', tool_result: { id: '123', content: 'test result' } },
                ],
            },
        ]
        const result = sanitizedChatMessages(messages)

        // The tool_call should be kept in the assistant message
        expect(result[0].content).toEqual([
            { type: 'text', text: 'I can help with that' },
            { type: 'tool_call', tool_call: { id: '123', name: 'test', arguments: '{}' } },
        ])

        // The human message should have the tool_result
        expect(result[1].content).toEqual([
            { type: 'text', text: 'Here is the result' },
            { type: 'tool_result', tool_result: { id: '123', content: 'test result' } },
        ])
    })

    it('should handle multiple assistant messages with tool_calls', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'assistant',
                content: [
                    { type: 'text', text: 'First message' },
                    { type: 'tool_call', tool_call: { id: '123', name: 'test1', arguments: '{}' } },
                ],
            },
            {
                speaker: 'human',
                content: [
                    { type: 'text', text: 'First response' },
                    { type: 'tool_result', tool_result: { id: '123', content: 'test result 1' } },
                ],
            },
            {
                speaker: 'assistant',
                content: [
                    { type: 'text', text: 'Second message' },
                    { type: 'tool_call', tool_call: { id: '456', name: 'test2', arguments: '{}' } },
                ],
            },
            {
                speaker: 'human',
                content: [{ type: 'text', text: 'No tool result this time' }],
            },
        ]
        const result = sanitizedChatMessages(messages)

        // First assistant message should keep its tool_call
        expect(result[0].content).toEqual([
            { type: 'text', text: 'First message' },
            { type: 'tool_call', tool_call: { id: '123', name: 'test1', arguments: '{}' } },
        ])

        // Second assistant message should have its tool_call removed
        expect(result[2].content).toEqual([{ type: 'text', text: 'Second message' }])
    })

    it('should filter out empty text parts', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'assistant',
                content: [
                    { type: 'text', text: '' },
                    { type: 'text', text: 'Hello' },
                    { type: 'text', text: '' },
                ],
            },
        ]
        const result = sanitizedChatMessages(messages)
        expect(result[0].content).toEqual([{ type: 'text', text: 'Hello' }])
    })

    it('should not duplicate text content when message has both text and content with same text', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'human',
                text: ps`Hello world`,
                content: [{ type: 'text', text: 'Hello world' }],
            },
        ]
        const result = sanitizedChatMessages(messages)
        expect(result[0].content).toEqual([{ type: 'text', text: 'Hello world' }])
    })

    it('should not duplicate text content when called multiple times', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'human',
                text: ps`Hello world`,
                content: [],
            },
        ]
        
        // First call adds text to content
        const result1 = sanitizedChatMessages(messages)
        expect(result1[0].content).toEqual([{ type: 'text', text: 'Hello world' }])
        
        // Simulate calling again with the processed result
        const processedMessages = [{
            ...result1[0],
            text: ps`Hello world`,
        }]
        const result2 = sanitizedChatMessages(processedMessages)
        expect(result2[0].content).toEqual([{ type: 'text', text: 'Hello world' }])
        expect(result2[0].content.length).toBe(1)
    })

    it('should handle text deduplication with think tags correctly', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'human',
                text: ps`<think>Remove this</think>Keep this`,
                content: [{ type: 'text', text: 'Keep this' }], // Already has processed text
            },
        ]
        const result = sanitizedChatMessages(messages)
        // Should not duplicate the text since processed text already exists
        expect(result[0].content).toEqual([{ type: 'text', text: 'Keep this' }])
        expect(result[0].content.length).toBe(1)
    })

    it('should remove tool_call from ANY assistant message if next human has no corresponding tool_result', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'assistant',
                content: [
                    { type: 'text', text: 'First assistant' },
                    { type: 'tool_call', tool_call: { id: '123', name: 'test1', arguments: '{}' } },
                ],
            },
            {
                speaker: 'human',
                content: [{ type: 'text', text: 'No tool result here' }],
            },
            {
                speaker: 'assistant',
                content: [
                    { type: 'text', text: 'Second assistant' },
                    { type: 'tool_call', tool_call: { id: '456', name: 'test2', arguments: '{}' } },
                ],
            },
            {
                speaker: 'human',
                content: [
                    { type: 'text', text: 'Has tool result' },
                    { type: 'tool_result', tool_result: { id: '456', content: 'result' } },
                ],
            },
        ]
        const result = sanitizedChatMessages(messages)
        
        // First assistant message should have tool_call removed
        expect(result[0].content).toEqual([{ type: 'text', text: 'First assistant' }])
        
        // Second assistant message should keep tool_call
        expect(result[2].content).toEqual([
            { type: 'text', text: 'Second assistant' },
            { type: 'tool_call', tool_call: { id: '456', name: 'test2', arguments: '{}' } },
        ])
    })

    it('should remove tool_call if some tool calls have no corresponding results', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'assistant',
                content: [
                    { type: 'text', text: 'Multiple tools' },
                    { type: 'tool_call', tool_call: { id: '123', name: 'test1', arguments: '{}' } },
                    { type: 'tool_call', tool_call: { id: '456', name: 'test2', arguments: '{}' } },
                ],
            },
            {
                speaker: 'human',
                content: [
                    { type: 'text', text: 'Only one result' },
                    { type: 'tool_result', tool_result: { id: '123', content: 'result for 123' } },
                    // Missing tool_result for id '456'
                ],
            },
        ]
        const result = sanitizedChatMessages(messages)
        
        // All tool_calls should be removed since one is orphaned
        expect(result[0].content).toEqual([{ type: 'text', text: 'Multiple tools' }])
    })

    it('should remove tool_call if there is no next message', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'assistant',
                content: [
                    { type: 'text', text: 'Last message' },
                    { type: 'tool_call', tool_call: { id: '123', name: 'test', arguments: '{}' } },
                ],
            },
        ]
        const result = sanitizedChatMessages(messages)
        
        // Tool call should be removed since there's no following message
        expect(result[0].content).toEqual([{ type: 'text', text: 'Last message' }])
    })

    it('should remove tool_call if next message is not human', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'assistant',
                content: [
                    { type: 'text', text: 'First assistant' },
                    { type: 'tool_call', tool_call: { id: '123', name: 'test', arguments: '{}' } },
                ],
            },
            {
                speaker: 'assistant',
                content: [{ type: 'text', text: 'Another assistant message' }],
            },
        ]
        const result = sanitizedChatMessages(messages)
        
        // Tool call should be removed since next message is not human
        expect(result[0].content).toEqual([{ type: 'text', text: 'First assistant' }])
    })

    it('should handle complex content deduplication', () => {
        const messages: ChatMessage[] = [
            {
                speaker: 'human',
                text: ps`Main text`,
                content: [
                    { type: 'text', text: 'Main text' },
                    { type: 'text', text: 'Additional text' },
                    { type: 'tool_result', tool_result: { id: '123', content: 'result' } },
                ],
            },
        ]
        const result = sanitizedChatMessages(messages)
        
        // Should not duplicate "Main text" but keep other content
        expect(result[0].content).toEqual([
            { type: 'text', text: 'Main text' },
            { type: 'text', text: 'Additional text' },
            { type: 'tool_result', tool_result: { id: '123', content: 'result' } },
        ])
    })
})
