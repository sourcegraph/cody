import { Readable } from 'stream'

import { describe, expect, it } from 'vitest'

import { createSSEIterator } from './client'

describe('createSSEIterator', () => {
    it('yields SSE messages from the iterator', async () => {
        async function* createIterator() {
            yield Buffer.from('event: completion\ndata: {"foo":"bar"}\n\n')
            yield Buffer.from('event: completion\ndata: {"baz":"qux"}\n\n')
        }

        const messages = []
        const iterator = createSSEIterator(Readable.from(createIterator()))

        for await (const message of iterator) {
            messages.push(message)
        }
        expect(messages).toEqual([
            { event: 'completion', data: '{"foo":"bar"}' },
            { event: 'completion', data: '{"baz":"qux"}' },
        ])
    })

    it('buffers partial responses', async () => {
        async function* createIterator() {
            yield Buffer.from('event: comple')
            yield Buffer.from('tion\ndata: {"foo":"bar"}\n')
            yield Buffer.from('\nevent: comple')
            yield Buffer.from('tion\ndata: {"baz":"qux"}\n\n')
        }

        const messages = []
        const iterator = createSSEIterator(Readable.from(createIterator()))

        for await (const message of iterator) {
            messages.push(message)
        }
        expect(messages).toEqual([
            { event: 'completion', data: '{"foo":"bar"}' },
            { event: 'completion', data: '{"baz":"qux"}' },
        ])
    })

    it('skips intermediate completion events', async () => {
        async function* createIterator() {
            yield Buffer.from(
                'event: completion\ndata: {"foo":"bar"}\n\nevent: completion\ndata: {"baz":"qux"}\n\n'
            )
        }

        const messages = []
        const iterator = createSSEIterator(Readable.from(createIterator()), {
            aggregatedCompletionEvent: true,
        })

        for await (const message of iterator) {
            messages.push(message)
        }
        expect(messages).toEqual([{ event: 'completion', data: '{"baz":"qux"}' }])
    })

    it('handles `: ` in the event name', async () => {
        async function* createIterator() {
            yield Buffer.from('event: foo: bar\ndata: {"baz":"qux"}\n\n')
        }

        const messages = []
        const iterator = createSSEIterator(Readable.from(createIterator()))

        for await (const message of iterator) {
            messages.push(message)
        }
        expect(messages).toEqual([{ event: 'foo: bar', data: '{"baz":"qux"}' }])
    })
})
