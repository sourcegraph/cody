import { type ContextItem, ContextItemSource, ps } from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { URI } from 'vscode-uri'
import * as openctxAPI from '../../../../lib/shared/src/context/openctx/api'
import { mockLocalStorage } from '../../services/LocalStorageProvider'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import { CodyTool, type CodyToolConfig } from './CodyTool'
import { CodyToolProvider, TestToolFactory, type ToolConfiguration } from './CodyToolProvider'
import { toolboxManager } from './ToolboxManager'

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
        CodyToolProvider.initialize(mockContextRetriever)
        vi.spyOn(openctxAPI, 'openctxController', 'get').mockReturnValue(Observable.of(mockController))
    })

    it('should register default tools on initialization', () => {
        const tools = CodyToolProvider.getTools()
        expect(tools.length).toBeGreaterThan(0)
        expect(tools.some(tool => tool.config.title.includes('Code Search'))).toBe(true)
        expect(tools.some(tool => tool.config.title.includes('Cody Memory'))).toBe(true)
    })

    it('should set up OpenCtx provider listener and build OpenCtx tools from provider metadata', async () => {
        CodyToolProvider.setupOpenCtxProviderListener()
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(mockController.metaChanges).toHaveBeenCalled()
        // Wait for the observable to emit
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
})

describe('ToolFactory', () => {
    let factory: TestToolFactory

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
})
