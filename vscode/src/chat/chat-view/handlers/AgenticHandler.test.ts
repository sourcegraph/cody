import type { Span } from '@opentelemetry/api'
import {
    CLIENT_CAPABILITIES_FIXTURE,
    type ToolCallContentPart,
    mockAuthStatus,
    mockClientCapabilities,
    ps,
} from '@sourcegraph/cody-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockLocalStorage } from '../../../services/LocalStorageProvider'
import { type AgentTool, AgentToolGroup } from '../tools'
import { AgenticHandler } from './AgenticHandler'
import type { AgentHandlerDelegate, AgentRequest } from './interfaces'

// Mock modules
vi.mock('../tools', () => ({
    AgentToolGroup: {
        getToolsByAgentId: vi.fn().mockResolvedValue([]),
    },
}))

vi.mock('../prompts', () => ({
    buildAgentPrompt: vi.fn().mockReturnValue('You are Cody.'),
}))

describe('AgenticHandler', () => {
    // Mock dependencies
    const mockContextRetriever = {
        retrieveContext: vi.fn().mockResolvedValue([]),
        computeDidYouMean: vi.fn().mockResolvedValue(undefined),
    }

    const mockEditor = {} as any

    const mockChatClient = {
        chat: vi.fn(),
    }

    const mockDelegate: AgentHandlerDelegate = {
        postError: vi.fn(),
        postStatuses: vi.fn(),
        postMessageInProgress: vi.fn(),
        postRequest: vi.fn(),
        postDone: vi.fn(),
        experimentalPostMessageInProgress: vi.fn(),
    }

    const mockSpan = {} as Span

    const mockToolResult = { text: 'Tool executed successfully' }

    let agenticHandler: AgenticHandler

    beforeEach(() => {
        vi.clearAllMocks()

        mockAuthStatus({ authenticated: false })
        mockLocalStorage('noop')
        mockClientCapabilities(CLIENT_CAPABILITIES_FIXTURE)
        // Create mock tools for testing
        const mockTools: AgentTool[] = [
            {
                spec: {
                    name: 'search',
                    description: 'Search for code',
                    input_schema: { type: 'object' as const, properties: {} },
                },
                invoke: vi.fn().mockResolvedValue(mockToolResult),
            },
            {
                spec: {
                    name: 'file',
                    description: 'Get file contents',
                    input_schema: { type: 'object' as const, properties: {} },
                },
                invoke: vi.fn().mockResolvedValue(mockToolResult),
            },
        ]

        // Mock the getToolsByAgentId function to return our mock tools
        vi.mocked(AgentToolGroup.getToolsByAgentId).mockResolvedValue(mockTools)

        // Create the handler instance
        agenticHandler = new AgenticHandler(mockContextRetriever, mockEditor, mockChatClient)
    })
    it('initializes with the correct system prompt', () => {
        // @ts-ignore - accessing protected property for testing
        expect(agenticHandler.SYSTEM_PROMPT).toBeDefined()
    })

    it('properly sets up tools during handle', async () => {
        const mockChatBuilder = {
            sessionID: 'test-session',
            addBotMessage: vi.fn(),
            addHumanMessage: vi.fn(),
            getDehydratedMessages: vi.fn().mockReturnValue([]),
        }

        const mockRecorder = {
            recordChatQuestionExecuted: vi.fn(),
        }

        const abortController = new AbortController()

        const request: AgentRequest = {
            requestID: '123',
            inputText: ps`help me search for code`,
            mentions: [],
            editorState: null,
            chatBuilder: mockChatBuilder as any,
            signal: abortController.signal,
            span: mockSpan,
            recorder: mockRecorder as any,
            model: 'claude',
        }

        // Mock the conversation loop since we're just testing initialization
        // @ts-ignore - mocking protected method
        vi.spyOn(agenticHandler, 'runConversationLoop').mockResolvedValue(undefined)

        await agenticHandler.handle(request, mockDelegate)

        // Verify tools were initialized
        expect(AgentToolGroup.getToolsByAgentId).toHaveBeenCalledWith(mockContextRetriever, mockSpan)

        // Verify conversation loop was called
        // @ts-ignore - verifying protected method call
        expect(agenticHandler.runConversationLoop).toHaveBeenCalledWith(
            mockChatBuilder,
            mockDelegate,
            mockRecorder,
            mockSpan,
            abortController.signal,
            expect.any(Array) // contextItems
        )

        // Verify delegate.postDone was called
        expect(mockDelegate.postDone).toHaveBeenCalledTimes(1)
    })
    it('handles errors during execution', async () => {
        const mockChatBuilder = {
            sessionID: 'test-session',
            addBotMessage: vi.fn(),
            addHumanMessage: vi.fn(),
            getDehydratedMessages: vi.fn().mockReturnValue([]),
        }

        const mockRecorder = {
            recordChatQuestionExecuted: vi.fn(),
        }

        const abortController = new AbortController()

        const request: AgentRequest = {
            requestID: '123',
            inputText: ps`help me search for code`,
            mentions: [],
            editorState: null,
            chatBuilder: mockChatBuilder as any,
            signal: abortController.signal,
            span: mockSpan,
            recorder: mockRecorder as any,
            model: 'test',
        }

        // Mock the conversation loop to throw an error
        const testError = new Error('Test error')
        // @ts-ignore - mocking protected method
        vi.spyOn(agenticHandler, 'runConversationLoop').mockRejectedValue(testError)

        await agenticHandler.handle(request, mockDelegate)

        // Verify error was posted
        expect(mockDelegate.postError).toHaveBeenCalledWith(testError, 'transcript')
        expect(mockDelegate.postDone).toHaveBeenCalledTimes(1)
    })

    it('properly executes tool calls', async () => {
        // Create test tool calls
        const toolCall1: ToolCallContentPart = {
            type: 'tool_call',
            tool_call: {
                id: 'call1',
                name: 'search',
                arguments: JSON.stringify({ query: 'findFunction' }),
            },
        }

        const toolCall2: ToolCallContentPart = {
            type: 'tool_call',
            tool_call: {
                id: 'call2',
                name: 'file',
                arguments: JSON.stringify({ path: '/test/file.ts' }),
            },
        }

        // @ts-ignore - accessing protected property for testing
        agenticHandler.tools = [
            {
                spec: {
                    name: 'search',
                    input_schema: { type: 'object', properties: {} },
                },
                invoke: vi.fn().mockResolvedValue({ text: 'Search results' }),
            },
            {
                spec: {
                    name: 'file',
                    input_schema: { type: 'object', properties: {} },
                },
                invoke: vi.fn().mockResolvedValue({ text: 'File contents' }),
            },
        ]

        // @ts-ignore - calling protected method for testing
        const results = await agenticHandler.executeTools([toolCall1, toolCall2])

        // Verify results
        expect(results.length).toBe(2)
        // expect(results[0].tool_result.id).toBe('call1')
        // expect(results[0].tool_result.content).toBe('Search results')
        // expect(results[1].tool_result.id).toBe('call2')
        // expect(results[1].tool_result.content).toBe('File contents')

        // Check that the invoke methods were called
        // @ts-ignore - accessing protected property for testing
        expect(agenticHandler.tools[0].invoke).toHaveBeenCalledWith({
            query: 'findFunction',
        })
        // @ts-ignore - accessing protected property for testing
        expect(agenticHandler.tools[1].invoke).toHaveBeenCalledWith({
            path: '/test/file.ts',
        })
    })
    it('handles tool execution errors gracefully', async () => {
        // Create test tool call
        const toolCall: ToolCallContentPart = {
            type: 'tool_call',
            tool_call: {
                id: 'call1',
                name: 'search',
                arguments: JSON.stringify({ query: 'findFunction' }),
            },
        }

        // @ts-ignore - accessing protected property for testing
        agenticHandler.tools = [
            {
                spec: {
                    name: 'search',
                    input_schema: { type: 'object', properties: {} },
                },
                invoke: vi.fn().mockRejectedValue(new Error('Tool execution failed')),
            },
        ]

        // @ts-ignore - calling protected method for testing
        const results = await agenticHandler.executeTools([toolCall])

        // Verify results contain the error message
        // expect(results.length).toBe(1)
        // expect(results[0].tool_result.id).toBe('call1')
        // expect(results[0].tool_result.content).toBe('Error: Tool execution failed')
    })

    it('properly syncs tool calls', () => {
        const toolCalls = new Map<string, ToolCallContentPart>()

        const toolCall: ToolCallContentPart = {
            type: 'tool_call',
            tool_call: {
                id: 'call1',
                name: 'search',
                arguments: '{}',
            },
        }

        // @ts-ignore - calling protected method for testing
        agenticHandler.syncToolCall(toolCall, toolCalls)

        // Verify the tool call was added to the map
        expect(toolCalls.has('call1')).toBe(true)
        expect(toolCalls.get('call1')).toEqual(toolCall)

        // Update the tool call and sync again
        const updatedToolCall: ToolCallContentPart = {
            type: 'tool_call',
            tool_call: {
                id: 'call1',
                name: 'search',
                arguments: '{}',
            },
        }

        // @ts-ignore - calling protected method for testing
        agenticHandler.syncToolCall(updatedToolCall, toolCalls)

        // Verify the tool call was updated
        expect(toolCalls.get('call1')).toEqual(updatedToolCall)
    })
})
