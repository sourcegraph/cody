import { describe, expect, it } from 'vitest'

import { CompletionsResponseBuilder } from './CompletionsResponseBuilder'

interface CompletionsResponseTestCase {
    name: string
    url: string
    steps: {
        deltaText?: string
        completion?: string
        thinking?: string
        expected: string
    }[]
}

describe('CompletionsResponseBuilder', () => {
    const testCases: CompletionsResponseTestCase[] = [
        {
            name: 'API v1 - Full replacement mode',
            url: 'https://sourcegraph.com/.api/completions/stream?api-version=1',
            steps: [
                {
                    completion: 'Direct',
                    expected: 'Direct',
                },
                {
                    completion: ' Response',
                    expected: ' Response',
                },
            ],
        },
        {
            name: 'API v2 - Incremental mode',
            url: 'https://sourcegraph.com/.api/completions/stream?api-version=2',
            steps: [
                {
                    deltaText: undefined,
                    expected: '',
                },
                {
                    deltaText: undefined,
                    expected: '',
                },
                {
                    deltaText: 'Starting response',
                    expected: 'Starting response',
                },
            ],
        },
        {
            name: 'API v2 - Incremental mode with thinking steps',
            url: 'https://sourcegraph.com/.api/completions/stream?api-version=2',
            steps: [
                {
                    thinking: 'Analyzing...',
                    expected: '<think>Analyzing...</think>\n',
                },
                {
                    thinking: 'Refining...',
                    expected: '<think>Analyzing...Refining...</think>\n',
                },
                {
                    deltaText: 'Better response',
                    expected: '<think>Analyzing...Refining...</think>\nBetter response',
                },
            ],
        },
        {
            name: 'API v8 - Incremental mode with thinking steps',
            url: 'https://sourcegraph.com/.api/completions/stream?api-version=8',
            steps: [
                {
                    thinking: 'Step 1...',
                    deltaText: 'Hello',
                    expected: '<think>Step 1...</think>\nHello',
                },
                {
                    thinking: 'Step 2...',
                    deltaText: ' World',
                    expected: '<think>Step 1...Step 2...</think>\nHello World',
                },
            ],
        },
    ]

    for (const testCase of testCases) {
        describe(testCase.name, () => {
            it('processes completion steps correctly', () => {
                const builder = CompletionsResponseBuilder.fromUrl(testCase.url)
                for (const step of testCase.steps) {
                    builder.nextThinking(step.thinking ?? undefined)
                    const result = builder.nextCompletion(step.completion, step.deltaText)
                    expect(result).toBe(step.expected)
                }
            })
        })
    }
})
