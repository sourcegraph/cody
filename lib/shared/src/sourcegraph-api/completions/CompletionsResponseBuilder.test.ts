import { describe, expect, it } from 'vitest'

import { CompletionsResponseBuilder } from './CompletionsResponseBuilder'
import type { CompletionFunctionCallsData } from './types'

interface CompletionsResponseTestCase {
    name: string
    url: string
    steps: {
        deltaText?: string
        completion?: string
        thinking?: string
        delta_tool_calls?: CompletionFunctionCallsData[]
        expected: string
        expectedToolCalls?: Record<string, any>[]
    }[]
}

describe('CompletionsResponseBuilder', () => {
    const testCases: CompletionsResponseTestCase[] = [
        {
            name: 'API v2 - Tool calls handling',
            url: 'https://sourcegraph.com/.api/completions/stream?api-version=2',
            steps: [
                {
                    delta_tool_calls: [
                        {
                            id: 'call_123',
                            type: 'function',
                            function: {
                                name: 'get_weather',
                                arguments: '{"location":"New York"',
                            },
                        },
                    ],
                    expected: '',
                    expectedToolCalls: [
                        {
                            id: 'call_123',
                            name: 'get_weather',
                            args: '{"location":"New York"',
                            status: 'pending',
                        },
                    ],
                },
                {
                    delta_tool_calls: [
                        {
                            id: 'call_123',
                            type: 'function',
                            function: {
                                name: 'get_weather',
                                arguments: ',"units":"celsius"}',
                            },
                        },
                    ],
                    expected: '',
                    expectedToolCalls: [
                        {
                            id: 'call_123',
                            name: 'get_weather',
                            args: '{"location":"New York","units":"celsius"}',
                            status: 'pending',
                        },
                    ],
                },
                {
                    delta_tool_calls: [
                        {
                            id: 'call_456',
                            type: 'function',
                            function: {
                                name: 'get_time',
                                arguments: '{"timezone":"UTC"}',
                            },
                        },
                    ],
                    expected: '',
                    expectedToolCalls: [
                        {
                            id: 'call_123',
                            name: 'get_weather',
                            args: '{"location":"New York","units":"celsius"}',
                            status: 'pending',
                        },
                        {
                            id: 'call_456',
                            name: 'get_time',
                            args: '{"timezone":"UTC"}',
                            status: 'pending',
                        },
                    ],
                },
            ],
        },
        {
            name: 'API v8 - Combined tool calls and text',
            url: 'https://sourcegraph.com/.api/completions/stream?api-version=8',
            steps: [
                {
                    deltaText: 'Here is the weather:',
                    delta_tool_calls: [
                        {
                            id: 'tool_abc',
                            type: 'function',
                            function: {
                                name: 'check_weather',
                                arguments: '{"city":"Seattle"}',
                            },
                        },
                    ],
                    expected: 'Here is the weather:',
                    expectedToolCalls: [
                        {
                            id: 'tool_abc',
                            name: 'check_weather',
                            args: '{"city":"Seattle"}',
                            status: 'pending',
                        },
                    ],
                },
                {
                    deltaText: ' The current temperature is',
                    thinking: 'Retrieving temperature...',
                    expected:
                        '<think>Retrieving temperature...</think>\nHere is the weather: The current temperature is',
                },
            ],
        },
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

                    if (step.delta_tool_calls) {
                        const toolCalls = builder.nextToolCalls(step.delta_tool_calls)
                        if (step.expectedToolCalls) {
                            expect(toolCalls.length).toBe(step.expectedToolCalls.length)
                            for (let i = 0; i < toolCalls.length; i++) {
                                expect(toolCalls[i].id).toBe(step.expectedToolCalls[i].id)
                                expect(toolCalls[i].function.name).toBe(step.expectedToolCalls[i].name)
                                expect(toolCalls[i].function.arguments).toBe(
                                    step.expectedToolCalls[i].args
                                )
                            }
                        }
                    }
                }
            })
        })
    }
})
