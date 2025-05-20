import { type ContextItem, ContextItemSource, ps } from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { URI } from 'vscode-uri'
import * as openctxAPI from '../../../../lib/shared/src/context/openctx/api'
import { mockLocalStorage } from '../../services/LocalStorageProvider'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import { CodyTool } from './CodyTool'
import { CodyToolProvider, TestToolFactory, type ToolConfiguration } from './CodyToolProvider'
import { toolboxManager } from './ToolboxManager'
import type { CodyToolConfig } from './types'

const localStorageData: { [key: string]: unknown } = {}
mockLocalStorage({
    get: (key: string) => localStorageData[key],
    update: (key: string, value: unknown) => {
        localStorageData[key] = value
    },
} as any)

const mockContextRetriever = {
    retrieveContext: vi.fn(),
} as unknown as Pick<ContextRetriever, 'retrieveContext'>

describe('CodyToolProvider', () => {
    // Create a mock controller before tests
    const mockController = {
        meta: vi.fn(),
        metaChanges: vi.fn().mockReturnValue(
            new Observable(subscriber => {
                subscriber.next([
                    {
                        id: 'test',
                        name: 'Test Provider',
                        queryLabel: 'Test Query',
                        emptyLabel: '',
                        mentions: {
                            label: 'Test Query',
                        },
                        providerUri: 'test-provider',
                    },
                    {
                        id: 'modelcontextprotocol-test',
                        name: 'Test Provider MCP',
                        mentions: {
                            label: 'Test Query MCP',
                        },
                        providerUri: 'test-provider-mcp',
                    },
                ])
                return () => {}
            })
        ),
        mentions: vi.fn(),
        mentionsChanges: vi.fn().mockReturnValue(
            new Observable(subscriber => {
                subscriber.next([])
                return () => {}
            })
        ),
        items: vi.fn(),
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(openctxAPI, 'openctxController', 'get').mockReturnValue(Observable.of(mockController))
    })

    it('should register default tools on initialization', async () => {
        CodyToolProvider.initialize(mockContextRetriever)
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(mockController.metaChanges).toHaveBeenCalled()
        const tools = CodyToolProvider.getTools()
        expect(tools.length).toBeGreaterThan(0)
        expect(tools.some(tool => tool.config.title.includes('Code Search'))).toBe(true)
        expect(tools.some(tool => tool.config.title.includes('Cody Memory'))).toBe(false)
    })

    it('should set up OpenCtx provider listener and build OpenCtx tools from provider metadata', async () => {
        await new Promise(resolve => setTimeout(resolve, 0))
        const tools = CodyToolProvider.getTools()
        expect(tools.some(tool => tool.config.title === 'Test Provider')).toBeTruthy()
        expect(tools.some(tool => tool.config.title === 'Test Provider MCP')).toBeTruthy()
        expect(tools.some(tool => tool.config.tags.tag.toString() === 'TOOLTESTPROVIDER')).toBeTruthy()
        expect(
            tools.some(tool => tool.config.tags.tag.toString() === 'TOOLTESTPROVIDERMCP')
        ).toBeTruthy()
    })

    it('should not include CLI tool if shell is disabled', () => {
        vi.spyOn(toolboxManager, 'getSettings').mockReturnValue({
            agent: { name: 'deep-cody' },
            shell: { enabled: false },
        })
        const tools = CodyToolProvider.getTools()
        expect(tools.some(tool => tool.config.title === 'Terminal')).toBe(false)
    })

    it('should include CLI tool if shell is enabled', () => {
        vi.spyOn(toolboxManager, 'getSettings').mockReturnValue({
            agent: { name: 'deep-cody' },
            shell: { enabled: true },
        })
        const tools = CodyToolProvider.getTools()
        expect(tools.some(tool => tool.config.title === 'Terminal')).toBe(true)
    })

    it('should register and include MCP tools', () => {
        const mockMcpTools = [
            {
                name: 'testMcpTool1',
                description: 'Test MCP Tool 1',
                input_schema: { type: 'object' as const, properties: {} },
            },
            {
                name: 'testMcpTool2',
                description: 'Test MCP Tool 2',
                input_schema: { type: 'object' as const, properties: {} },
            },
        ]

        const registeredTools = CodyToolProvider.registerMcpTools('test-server', mockMcpTools)
        expect(registeredTools.length).toBe(2)

        // Verify tools were properly registered
        const allTools = CodyToolProvider.getTools()
        expect(allTools.some(tool => tool.config.title === 'testMcpTool1')).toBe(true)
        expect(allTools.some(tool => tool.config.title === 'testMcpTool2')).toBe(true)
    })

    it('should not register disabled MCP tools', () => {
        const mockMcpTools = [
            {
                name: 'enabledTool',
                description: 'Enabled Tool',
                input_schema: { type: 'object' as const, properties: {} },
            },
            {
                name: 'disabledTool',
                description: 'Disabled Tool',
                input_schema: { type: 'object' as const, properties: {} },
                disabled: true,
            },
        ]

        const registeredTools = CodyToolProvider.registerMcpTools('test-server', mockMcpTools)
        // Only the enabled tool should be registered
        expect(registeredTools.length).toBe(1)
        expect(registeredTools[0].config.title).toBe('enabledTool')

        // Verify the disabled tool is not included in getTools()
        const allTools = CodyToolProvider.getTools()
        expect(allTools.some(tool => tool.config.title === 'enabledTool')).toBe(true)
        expect(allTools.some(tool => tool.config.title === 'disabledTool')).toBe(false)
    })

    it('should update tool disabled state and filter out disabled tools', () => {
        // Register a tool
        const mockMcpTools = [
            {
                name: 'toggleableTool',
                description: 'Toggleable Tool',
                input_schema: { type: 'object' as const, properties: {} },
            },
        ]

        CodyToolProvider.registerMcpTools('test-server', mockMcpTools)

        // Tool should be enabled by default
        let allTools = CodyToolProvider.getTools()
        expect(allTools.some(tool => tool.config.title === 'toggleableTool')).toBe(true)

        // Update to disabled state
        const updated = CodyToolProvider.updateToolDisabledState('TOOLTEST-SERVER-TOGGLEABLETOOL', true)
        expect(updated).toBe(true)

        // Tool should now be filtered out
        allTools = CodyToolProvider.getTools()
        expect(allTools.some(tool => tool.config.title === 'toggleableTool')).toBe(false)

        // Update back to enabled state
        const reEnabled = CodyToolProvider.updateToolDisabledState(
            'TOOLTEST-SERVER-TOGGLEABLETOOL',
            false
        )
        expect(reEnabled).toBe(true)

        // Tool should be back in the list
        allTools = CodyToolProvider.getTools()
        expect(allTools.some(tool => tool.config.title === 'toggleableTool')).toBe(true)
    })
})

describe('ToolFactory', () => {
    let factory: TestToolFactory

    // Mock required for MCP execution test
    vi.mock('../../chat/chat-view/tools/MCPManager', async () => {
        const actual = (await vi.importActual('../../chat/chat-view/tools/MCPManager')) as any
        return {
            ...actual,
            MCPManager: {
                instance: {
                    executeTool: vi
                        .fn()
                        .mockResolvedValue({ content: 'MCP tool executed successfully' }),
                },
            },
        }
    })

    class TestCodyTool extends CodyTool {
        public async execute(): Promise<ContextItem[]> {
            return Promise.resolve([])
        }
    }

    const testToolConfig = {
        name: 'TestTool',
        title: 'Test Tool',
        tags: {
            tag: ps`TOOLTEST`,
            subTag: ps`test`,
        },
        prompt: {
            instruction: ps`To test the ToolFactory class`,
            placeholder: ps`TEST_CONTENT`,
            examples: [],
        },
        createInstance: (config: CodyToolConfig) => new TestCodyTool(config),
    } satisfies ToolConfiguration

    beforeEach(() => {
        const mockRretrievedResult = [
            {
                type: 'file',
                uri: URI.file('/path/to/repo/newfile.ts'),
                content: 'const newExample = "test result";',
                source: ContextItemSource.Search,
            },
        ] satisfies ContextItem[]
        const mockContextRetriever = {
            retrieveContext: vi.fn().mockResolvedValue(mockRretrievedResult),
        } as unknown as ContextRetriever
        factory = new TestToolFactory(mockContextRetriever)
    })

    it('should register and create tools correctly', () => {
        factory.register(testToolConfig)
        const testTool = factory.createTool('TestTool')
        expect(testTool).toBeDefined()
        expect(testTool).toBeInstanceOf(CodyTool)
    })

    it('should return undefined for unregistered tools', () => {
        const unknownTool = factory.createTool('UnknownTool')
        expect(unknownTool).toBeUndefined()
    })

    it('should return all registered tool instances including default tools', () => {
        const testToolConfig1 = { ...testToolConfig, name: 'TestTool1' }
        const testToolConfig2 = { ...testToolConfig, name: 'TestTool2' }

        factory.register(testToolConfig1)
        factory.register(testToolConfig2)

        const tools = factory.getInstances()
        expect(tools.length).toBeGreaterThan(2)
        expect(tools.filter(tool => tool instanceof TestCodyTool).length).toBe(2)
    })

    it('should create and execute MCP tools', async () => {
        const mockMcpTools = [
            {
                name: 'testMcpTool',
                description: 'Test MCP Tool',
                input_schema: { type: 'object' as const, properties: {} },
            },
        ]
        const serverName = 'test-server'

        // Create MCP tools
        const mcpTools = factory.createMcpTools(mockMcpTools, serverName)
        expect(mcpTools.length).toBe(1)

        // Get all instances - should include MCP tools
        const allTools = factory.getInstances()
        const mcpTool = allTools.find(tool => tool.config.title === 'testMcpTool')
        expect(mcpTool).toBeDefined()

        // Test executing the MCP tool
        if (mcpTool) {
            // Mock span
            const mockSpan = { addEvent: vi.fn() } as any
            const result = await mcpTool.execute(mockSpan, ['{}'])

            expect(result.length).toBe(1)
            expect(result[0].content).toContain('executed successfully')
            expect(result[0].source).toBe(ContextItemSource.Agentic)
        }
    })

    it('should filter out disabled MCP tools when creating tools', () => {
        const mockMcpTools = [
            {
                name: 'enabledMcpTool',
                description: 'Enabled MCP Tool',
                input_schema: { type: 'object' as const, properties: {} },
            },
            {
                name: 'disabledMcpTool',
                description: 'Disabled MCP Tool',
                input_schema: { type: 'object' as const, properties: {} },
                disabled: true,
            },
        ]
        const serverName = 'test-server'

        // Create MCP tools - should only create the enabled one
        const mcpTools = factory.createMcpTools(mockMcpTools, serverName)
        expect(mcpTools.length).toBe(1)
        expect(mcpTools[0].config.title).toBe('enabledMcpTool')

        // Get all instances - should only include the enabled MCP tool
        const allTools = factory.getInstances()
        expect(allTools.some(tool => tool.config.title === 'enabledMcpTool')).toBe(true)
        expect(allTools.some(tool => tool.config.title === 'disabledMcpTool')).toBe(false)

        // Verify the disabled flag was properly passed to the tool config
        const enabledTool = allTools.find(tool => tool.config.title === 'enabledMcpTool')
        expect(enabledTool?.config.disabled).toBeUndefined()
    })

    it('should properly normalize tool names', () => {
        // Test normalizeToolName with server name
        expect(TestToolFactory.normalizeToolName('my.complex-tool!', 'test-server')).toBe(
            'test-server-my-complex-tool'
        )

        // Test normalizeToolName without server name
        expect(TestToolFactory.normalizeToolName('my.complex-tool!')).toBe('my-complex-tool')

        // Test getCodyToolName with server name
        expect(TestToolFactory.getCodyToolName('my.complex-tool!', 'test-server')).toBe(
            'TOOLTEST-SERVER-MY-COMPLEX-TOOL'
        )

        // Test getCodyToolName without server name
        expect(TestToolFactory.getCodyToolName('my.complex-tool!')).toBe('TOOLMY-COMPLEX-TOOL')
    })

    it('should handle disabled tools correctly', () => {
        // Register a regular tool with disabled flag
        const disabledToolConfig = {
            ...testToolConfig,
            name: 'DisabledTool',
            disabled: true,
        }
        factory.register(disabledToolConfig)

        // Creating a disabled tool should return undefined
        const disabledTool = factory.createTool('DisabledTool')
        expect(disabledTool).toBeUndefined()

        // Disabled tools should be filtered from getInstances
        const tools = factory.getInstances()
        expect(tools.some(tool => tool.config.title === 'DisabledTool')).toBe(false)

        // Test updating tool disabled state
        factory.register({ ...testToolConfig, name: 'ToggleableTool' })
        expect(factory.createTool('ToggleableTool')).toBeDefined()

        // Update to disabled
        const updated = factory.updateToolDisabledState('ToggleableTool', true)
        expect(updated).toBe(true)
        expect(factory.createTool('ToggleableTool')).toBeUndefined()

        // Update back to enabled
        const reEnabled = factory.updateToolDisabledState('ToggleableTool', false)
        expect(reEnabled).toBe(true)
        expect(factory.createTool('ToggleableTool')).toBeDefined()

        // Attempt to update non-existent tool
        const nonExistentUpdate = factory.updateToolDisabledState('NonExistentTool', true)
        expect(nonExistentUpdate).toBe(false)
    })
})
