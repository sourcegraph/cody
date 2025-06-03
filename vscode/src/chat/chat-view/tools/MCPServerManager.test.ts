import { ContextItemSource, type MessagePart, UIToolStatus } from '@sourcegraph/cody-shared'
import type { ContextItem } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { createMCPToolState, transforMCPToolResult } from './MCPServerManager'

describe('MCPServerManager helper functions', () => {
    describe('transforMCPToolResult', () => {
        it.each([
            {
                name: 'handles text content',
                input: [{ type: 'text', text: 'Hello world' }],
                toolName: 'testTool',
                expected: {
                    context: [],
                    contents: [{ type: 'text', text: 'Hello world' }],
                },
            },
            {
                name: 'handles empty text content',
                input: [{ type: 'text', text: '' }],
                toolName: 'testTool',
                expected: {
                    context: [],
                    contents: [{ type: 'text', text: 'EMPTY' }],
                },
            },
            {
                name: 'handles image content',
                input: [{ type: 'image', data: 'base64data', mimeType: 'image/png' }],
                toolName: 'testTool',
                expected: {
                    context: [
                        {
                            type: 'media',
                            title: 'testTool_result',
                            uri: URI.parse(''),
                            mimeType: 'image/png',
                            filename: 'mcp_tool_result',
                            data: 'base64data',
                            content: 'tool result',
                        },
                    ],
                    contents: [
                        {
                            type: 'image_url',
                            image_url: { url: 'data:image/png;base64,base64data==' },
                        },
                    ],
                },
            },
            {
                name: 'handles unsupported content type',
                input: [{ type: 'unsupported', data: 'something' }],
                toolName: 'testTool',
                expected: {
                    context: [],
                    contents: [
                        { type: 'text', text: 'testTool returned unsupported result type: unsupported' },
                    ],
                },
            },
            {
                name: 'handles multiple content types',
                input: [
                    { type: 'text', text: 'Result text' },
                    { type: 'image', data: 'image-data', mimeType: 'image/jpeg' },
                ],
                toolName: 'testTool',
                expected: {
                    context: [
                        {
                            type: 'media',
                            title: 'testTool_result',
                            uri: URI.parse(''),
                            mimeType: 'image/jpeg',
                            filename: 'mcp_tool_result',
                            data: 'image-data',
                            content: 'tool result',
                        },
                    ],
                    contents: [
                        { type: 'text', text: 'Result text' },
                        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,image-data==' } },
                    ],
                },
            },
            {
                name: 'handles empty input array',
                input: [],
                toolName: 'testTool',
                expected: {
                    context: [],
                    contents: [],
                },
            },
        ])('$name', ({ input, toolName, expected }) => {
            const result = transforMCPToolResult(input, toolName)
            expect(result.contents).toEqual(expected.contents)
            expect(result.context).toEqual(expected.context)
        })
    })

    describe('createMCPToolState', () => {
        it.each([
            {
                name: 'creates tool state with text parts',
                serverName: 'testServer',
                toolName: 'testTool',
                parts: [{ type: 'text', text: 'Hello world' }],
                context: undefined,
                status: UIToolStatus.Done,
                expected: {
                    type: 'tool-state',
                    toolName: 'testServer_testTool',
                    content: `<TOOLRESULT tool='testTool'>Hello world
[Please communicate the result to the user]</TOOLRESULT>`,
                    outputType: 'mcp',
                    uri: URI.parse(''),
                    title: 'testServer - testTool',
                    description: 'Hello world',
                    source: ContextItemSource.Agentic,
                    icon: 'database',
                    metadata: ['mcp', 'testTool'],
                    parts: [{ type: 'text', text: 'Hello world' }],
                    context: undefined,
                    status: UIToolStatus.Done,
                    toolId: 'placeholder',
                },
            },
            {
                name: 'creates tool state with error status',
                serverName: 'errServer',
                toolName: 'errTool',
                parts: [{ type: 'text', text: 'Error occurred' }],
                context: undefined,
                status: UIToolStatus.Error,
                expected: {
                    type: 'tool-state',
                    toolName: 'errServer_errTool',
                    content: `<TOOLRESULT tool='errTool'>Error occurred
[Please communicate the result to the user]</TOOLRESULT>`,
                    outputType: 'mcp',
                    uri: URI.parse(''),
                    title: 'errServer - errTool',
                    description: 'Error occurred',
                    source: ContextItemSource.Agentic,
                    icon: 'database',
                    metadata: ['mcp', 'errTool'],
                    parts: [{ type: 'text', text: 'Error occurred' }],
                    context: undefined,
                    status: UIToolStatus.Error,
                    toolId: 'placeholder',
                },
            },
            {
                name: 'combines multiple text parts',
                serverName: 'testServer',
                toolName: 'testTool',
                parts: [
                    { type: 'text', text: 'First part' },
                    { type: 'text', text: 'Second part' },
                    { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
                ],
                context: [
                    {
                        type: 'media',
                        title: 'test-media',
                        uri: URI.parse(''),
                        mimeType: 'text/plain',
                        filename: 'test.txt',
                        data: 'test',
                        content: 'test',
                    },
                ] as ContextItem[],
                status: UIToolStatus.Done,
                expected: {
                    type: 'tool-state',
                    toolName: 'testServer_testTool',
                    content: `<TOOLRESULT tool='testTool'>First part
Second part
[Please communicate the result to the user]</TOOLRESULT>`,
                    outputType: 'mcp',
                    uri: URI.parse(''),
                    title: 'testServer - testTool',
                    description: 'First part\nSecond part',
                    source: ContextItemSource.Agentic,
                    icon: 'database',
                    metadata: ['mcp', 'testTool'],
                    parts: [
                        { type: 'text', text: 'First part' },
                        { type: 'text', text: 'Second part' },
                        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
                    ],
                    context: [
                        {
                            type: 'media',
                            title: 'test-media',
                            uri: URI.parse(''),
                            mimeType: 'text/plain',
                            filename: 'test.txt',
                            data: 'test',
                            content: 'test',
                        },
                    ],
                    status: UIToolStatus.Done,
                    toolId: 'placeholder',
                },
            },
        ])('$name', ({ serverName, toolName, parts, context, status, expected }) => {
            // Cast parts to MessagePart[] to satisfy TypeScript
            const result = createMCPToolState(
                serverName,
                toolName,
                parts as MessagePart[],
                context,
                status
            )

            // Test equality excluding toolId which contains a timestamp
            const { toolId: resultId, ...resultWithoutId } = result
            // Add toolId to expected for TypeScript
            const { toolId = '', ...expectedWithoutId } = expected

            expect(resultWithoutId).toEqual(expectedWithoutId)
            // Use a simpler check to verify the ID format starts with mcp-[toolName]-
            expect(resultId.startsWith(`mcp-${toolName}-`)).toBe(true)
        })
    })
})
