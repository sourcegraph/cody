import { type ContextItem, openCtx, ps } from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockLocalStorage } from '../../services/LocalStorageProvider'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import { CodyTool, type CodyToolConfig } from './CodyTool'
import {
    CodyToolProvider,
    type ToolConfiguration,
    ToolFactory,
    type ToolRegistry,
} from './CodyToolProvider'
import { toolboxSettings } from './ToolboxManager'

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
    let provider: CodyToolProvider
    let factory: ToolFactory

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
        provider = CodyToolProvider.instance(mockContextRetriever)
        factory = CodyToolProvider.toolFactory

        // Directly set the controller property on openCtx
        openCtx.controller = mockController
    })

    it('should create a singleton instance', () => {
        const provider2 = CodyToolProvider.instance(mockContextRetriever)
        expect(provider).toStrictEqual(provider2)
    })

    it('should register default tools on initialization', () => {
        const tools = factory.getAllTools()
        expect(tools.length).toBeGreaterThan(0)
        expect(tools.some(tool => tool.name === 'SearchTool')).toBe(true)
        expect(tools.some(tool => tool.name === 'MemoryTool')).toBe(true)
    })

    it('should build default tool instances', () => {
        const tools = provider.getTools()
        expect(tools.length).toBeGreaterThan(0)
        expect(tools.some(tool => tool.config.title.includes('Code Search'))).toBe(true)
        expect(tools.some(tool => tool.config.title.includes('Cody Memory'))).toBe(true)
    })

    it('should handle no OpenCtx providers', async () => {
        // Do not invoke setupOpenCtxProviderListener
        const tools = provider.getTools()
        expect(tools.some(tool => tool.config.title === 'Test Provider')).toBe(false)
    })

    it('should set up OpenCtx provider listener', () => {
        CodyToolProvider.setupOpenCtxProviderListener()
        expect(openCtx.controller?.metaChanges).toHaveBeenCalled()
    })

    it('should build OpenCtx tools from provider metadata', async () => {
        openCtx.controller = mockController

        CodyToolProvider.setupOpenCtxProviderListener()
        // Wait for the observable to emit
        await new Promise(resolve => setTimeout(resolve, 0))

        const tools = provider.getTools()
        console.log(tools, 'tools')
        expect(tools.some(tool => tool.config.title === 'Test Provider')).toBe(true)
        expect(tools.some(tool => tool.config.title === 'Test Provider MCP')).toBe(true)
        expect(tools.some(tool => tool.config.tags.tag.toString() === 'TOOLTESTPROVIDER')).toBe(true)
        expect(tools.some(tool => tool.config.tags.tag.toString() === 'TOOLTESTPROVIDERMCP')).toBe(true)
    })

    it('should not register CLI tool if shell is disabled', () => {
        const mockGetSettings = vi.fn()
        mockGetSettings.mockReturnValue({ agent: true, shell: false })
        vi.spyOn(toolboxSettings, 'getSettings').mockImplementation(mockGetSettings)

        const tools = provider.getTools()
        expect(tools.some(tool => tool.config.title === 'Terminal')).toBe(false)
    })

    it('should register CLI tool if shell is enabled', () => {
        const mockGetSettings = vi.fn()
        mockGetSettings.mockReturnValue({ agent: true, shell: true })
        vi.spyOn(toolboxSettings, 'getSettings').mockImplementation(mockGetSettings)

        const tools = provider.getTools()
        expect(tools.some(tool => tool.config.title === 'Terminal')).toBe(true)
    })

    it('should create a tool instance using the factory', () => {
        const testTool = factory.createTool('SearchTool')
        expect(testTool).toBeDefined()
        expect(testTool).toBeInstanceOf(CodyTool)
    })

    it('should return undefined for unregistered tools', () => {
        const unknownTool = factory.createTool('UnknownTool')
        expect(unknownTool).toBeUndefined()
    })
})

describe('ToolFactory', () => {
    let factory: ToolFactory
    let registry: ToolRegistry

    // Create a concrete test class that extends CodyTool
    class TestCodyTool extends CodyTool {
        protected async execute(): Promise<ContextItem[]> {
            // Implement the abstract method
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
        factory = new ToolFactory()
        registry = factory.registry
    })

    it('should register and retrieve tools correctly', () => {
        factory.registerTool(testToolConfig)
        const toolConfig = registry.get('TestTool')
        expect(toolConfig).toBeDefined()
        expect(toolConfig?.name).toBe('TestTool')
    })

    it('should create tool instances using the factory', () => {
        factory.registerTool(testToolConfig)
        const testTool = factory.createTool('TestTool')
        expect(testTool).toBeDefined()
        expect(testTool).toBeInstanceOf(CodyTool)
    })

    it('should return undefined for unregistered tools', () => {
        const unknownTool = factory.createTool('UnknownTool')
        expect(unknownTool).toBeUndefined()
    })

    it('should return all registered tools', () => {
        const testToolConfig1 = {
            name: 'TestTool1',
            title: 'Test Tool 1',
            tags: {
                tag: ps`TOOLTEST1`,
                subTag: ps`test`,
            },
            prompt: {
                instruction: ps`To test the ToolFactory class`,
                placeholder: ps`TEST_CONTENT`,
                examples: [],
            },
            createInstance: config => new TestCodyTool(config),
        } satisfies ToolConfiguration
        const testToolConfig2 = {
            name: 'TestTool2',
            title: 'Test Tool 2',
            tags: {
                tag: ps`TOOLTEST2`,
                subTag: ps`test`,
            },
            prompt: {
                instruction: ps`To test the ToolFactory class`,
                placeholder: ps`TEST_CONTENT`,
                examples: [],
            },
            createInstance: config => new TestCodyTool(config),
        } satisfies ToolConfiguration
        factory.registerTool(testToolConfig1)
        factory.registerTool(testToolConfig2)
        const tools = factory.getAllTools()
        expect(tools.length).toBe(2)
        expect(tools.some(tool => tool.name === 'TestTool1')).toBe(true)
        expect(tools.some(tool => tool.name === 'TestTool2')).toBe(true)
    })
})
