import { describe, expect, it } from 'vitest'
import { createSSEIterator } from './sse-iterator'

function createTestStream(chunks: string[]): ReadableStream {
    return new ReadableStream({
        async start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(new TextEncoder().encode(chunk))
            }
            controller.close()
        },
    })
}

describe('createSSEIterator', () => {
    it('yields SSE messages from the iterator', async () => {
        const stream = createTestStream([
            'event: completion\ndata: {"foo":"bar"}\n\n',
            'event: completion\ndata: {"baz":"qux"}\n\n',
        ])

        const messages = []
        const iterator = createSSEIterator(stream)

        for await (const message of iterator) {
            messages.push(message)
        }
        expect(messages).toEqual([
            { event: 'completion', data: '{"foo":"bar"}' },
            { event: 'completion', data: '{"baz":"qux"}' },
        ])
    })

    it('buffers partial responses', async () => {
        const stream = createTestStream([
            'event: comple',
            'tion\ndata: {"foo":"bar"}\n',
            '\nevent: comple',
            'tion\ndata: {"baz":"qux"}\n\n',
        ])

        const messages = []
        const iterator = createSSEIterator(stream)

        for await (const message of iterator) {
            messages.push(message)
        }
        expect(messages).toEqual([
            { event: 'completion', data: '{"foo":"bar"}' },
            { event: 'completion', data: '{"baz":"qux"}' },
        ])
    })

    it('skips intermediate completion events', async () => {
        const stream = createTestStream([
            'event: completion\ndata: {"foo":"bar"}\n\nevent: completion\ndata: {"baz":"qux"}\n\n',
        ])

        const messages = []
        const iterator = createSSEIterator(stream, {
            aggregatedCompletionEvent: true,
        })

        for await (const message of iterator) {
            messages.push(message)
        }
        expect(messages).toEqual([{ event: 'completion', data: '{"baz":"qux"}' }])
    })

    it('handles `: ` in the event name', async () => {
        const stream = createTestStream(['event: foo: bar\ndata: {"baz":"qux"}\n\n'])

        const messages = []
        const iterator = createSSEIterator(stream)

        for await (const message of iterator) {
            messages.push(message)
        }
        expect(messages).toEqual([{ event: 'foo: bar', data: '{"baz":"qux"}' }])
    })
})
