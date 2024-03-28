import { describe, test, expect, vi } from 'vitest'
import { ollamaChatClient } from './chat-client'
import type {
    CompletionCallbacks,
    CompletionParameters,
} from '../sourcegraph-api/completions/types'
import type { CompletionLogger } from '../sourcegraph-api/completions/client'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('renderMarkdown', () => {
    test('single record', async () => {
        const mockStream = () => {
            const data = [
              '{"message": { "role": "assistant", "content": " Hi" }}',
            ];
            return new ReadableStream({
              start(controller) {
                data.forEach((chunk) => {
                    const encoded = new TextEncoder().encode(chunk);
                    controller.enqueue(encoded);
                });
                controller.close();
              }
            });
        }
        global.fetch = vi.fn<any[]>(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                headers: {
                    'content-type': 'application/x-ndjson',
                },
                body: mockStream(),
            })
        )
        const params: CompletionParameters = {
            model: 'ollama/gpt2',
            messages: [
                { speaker: 'human', text: 'Hello' },
            ],
            temperature: 0.7,
            topK: 50,
            topP: 0.9,
            maxTokensToSample: 100,
        }
        const completionsEndpoint = 'http://localhost:8080/api/chat'
        const logger: CompletionLogger = {
            startCompletion: vi.fn(),
        }
        const cb: CompletionCallbacks = {
            onComplete: vi.fn(),
            onChange: vi.fn(),
            onError: vi.fn(),
        }
        ollamaChatClient(params, cb, completionsEndpoint, logger)
        await delay(1000)
        expect(fetch).toHaveBeenCalledWith(
            'http://localhost:11434/api/chat',
            {
                method: 'POST',
                body: JSON.stringify({
                    model: 'gpt2',
                    messages: [
                        { role: 'user', content: 'Hello' },
                    ],
                    options: {
                        temperature: 0.7,
                        top_k: 50,
                        top_p: 0.9,
                        tfs_z: 100,
                    },
                }),
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        )
        expect(cb.onComplete).toHaveBeenCalledTimes(1)
        expect(cb.onError).not.toHaveBeenCalled()
        expect(cb.onChange).toHaveBeenCalledTimes(1)
        expect(cb.onChange).toHaveBeenCalledWith(' Hi')
    })
    test('multiple records', async () => {
        const mockStream = () => {
            const data = [
              '{"message": { "role": "assistant", "content": " Hi" }}\n',
              '{"message": { "role": "assistant", "content": " There!" }}',
            ];
            return new ReadableStream({
              start(controller) {
                data.forEach((chunk) => {
                    const encoded = new TextEncoder().encode(chunk);
                    controller.enqueue(encoded);
                });
                controller.close();
              }
            });
        }
        global.fetch = vi.fn<any[]>(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                headers: {
                    'content-type': 'application/x-ndjson',
                },
                body: mockStream(),
            })
        )
        const params: CompletionParameters = {
            model: 'ollama/gpt2',
            messages: [
                { speaker: 'human', text: 'Hello' },
            ],
            temperature: 0.7,
            topK: 50,
            topP: 0.9,
            maxTokensToSample: 100,
        }
        const completionsEndpoint = 'http://localhost:8080/api/chat'
        const logger: CompletionLogger = {
            startCompletion: vi.fn(),
        }
        const cb: CompletionCallbacks = {
            onComplete: vi.fn(),
            onChange: vi.fn(),
            onError: vi.fn(),
        }
        ollamaChatClient(params, cb, completionsEndpoint, logger)
        await delay(1000)
        expect(fetch).toHaveBeenCalledWith(
            'http://localhost:11434/api/chat',
            {
                method: 'POST',
                body: JSON.stringify({
                    model: 'gpt2',
                    messages: [
                        { role: 'user', content: 'Hello' },
                    ],
                    options: {
                        temperature: 0.7,
                        top_k: 50,
                        top_p: 0.9,
                        tfs_z: 100,
                    },
                }),
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        )
        expect(cb.onComplete).toHaveBeenCalledTimes(1)
        expect(cb.onError).not.toHaveBeenCalled()
        expect(cb.onChange).toHaveBeenCalledTimes(2)
        expect(cb.onChange).toHaveBeenCalledWith(' Hi')
        expect(cb.onChange).toHaveBeenCalledWith(' Hi There!')
    })

    test('multiple records, with trailing <cr>', async () => {
        const mockStream = () => {
            const data = [
              '{"message": { "role": "assistant", "content": " Hi" }}\n',
              '{"message": { "role": "assistant", "content": " There!" }}\n',
            ];
            return new ReadableStream({
              start(controller) {
                data.forEach((chunk) => {
                    const encoded = new TextEncoder().encode(chunk);
                    controller.enqueue(encoded);
                });
                controller.close();
              }
            });
        }
        global.fetch = vi.fn<any[]>(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                headers: {
                    'content-type': 'application/x-ndjson',
                },
                body: mockStream(),
            })
        )
        const params: CompletionParameters = {
            model: 'ollama/gpt2',
            messages: [
                { speaker: 'human', text: 'Hello' },
            ],
            temperature: 0.7,
            topK: 50,
            topP: 0.9,
            maxTokensToSample: 100,
        }
        const completionsEndpoint = 'http://localhost:8080/api/chat'
        const logger: CompletionLogger = {
            startCompletion: vi.fn(),
        }
        const cb: CompletionCallbacks = {
            onComplete: vi.fn(),
            onChange: vi.fn(),
            onError: vi.fn(),
        }
        ollamaChatClient(params, cb, completionsEndpoint, logger)
        await delay(1000)
        expect(fetch).toHaveBeenCalledWith(
            'http://localhost:11434/api/chat',
            {
                method: 'POST',
                body: JSON.stringify({
                    model: 'gpt2',
                    messages: [
                        { role: 'user', content: 'Hello' },
                    ],
                    options: {
                        temperature: 0.7,
                        top_k: 50,
                        top_p: 0.9,
                        tfs_z: 100,
                    },
                }),
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        )
        expect(cb.onComplete).toHaveBeenCalledTimes(1)
        expect(cb.onError).not.toHaveBeenCalled()
        expect(cb.onChange).toHaveBeenCalledTimes(2)
        expect(cb.onChange).toHaveBeenCalledWith(' Hi')
        expect(cb.onChange).toHaveBeenCalledWith(' Hi There!')
    })
})
