import type { Span } from '@opentelemetry/api'
import { type ContextItem, ContextItemSource, ps } from '@sourcegraph/cody-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { mockLocalStorage } from '../../services/LocalStorageProvider'
import type { ContextRetriever } from '../chat-view/ContextRetriever'
import { CodyTool, OpenCtxTool } from './CodyTool'
import { CodyToolProvider, TestToolFactory, type ToolStatusCallback } from './CodyToolProvider'
import { toolboxManager } from './ToolboxManager'

const mockCallback: ToolStatusCallback = {
    onStart: vi.fn(),
    onStream: vi.fn(),
    onComplete: vi.fn(),
}

class TestTool extends CodyTool {
    public async execute(span: Span, queries: string[]): Promise<ContextItem[]> {
        if (queries.length) {
            mockCallback?.onStream(this.config.title, queries.join(', '))
            // Return mock context items based on queries
            return queries.map(query => ({
                type: 'file',
                content: query,
                uri: URI.file('/test'),
                source: ContextItemSource.Agentic,
                title: 'TestTool',
            }))
        }
        return []
    }
}

describe('CodyTool', () => {
    let factory: TestToolFactory
    let mockSpan: any
    let mockContextRetriever: ContextRetriever

    beforeEach(() => {
        vi.clearAllMocks()

        const mockRretrievedResult = [
            {
                type: 'file',
                uri: URI.file('/path/to/repo/newfile.ts'),
                content: 'const newExample = "test result";',
                source: ContextItemSource.Search,
            },
        ] satisfies ContextItem[]
        mockContextRetriever = {
            retrieveContext: vi.fn().mockResolvedValue(mockRretrievedResult),
        } as unknown as ContextRetriever

        factory = new TestToolFactory(mockContextRetriever)
        mockSpan = {}
        factory.register({
            name: 'TestTool',
            title: 'TestTool',
            tags: {
                tag: ps`TOOLTEST`,
                subTag: ps`test`,
            },
            prompt: {
                instruction: ps`To test the CodyTool class`,
                placeholder: ps`TEST_CONTENT`,
                examples: [ps`Test the tool: \`<TESTTOOL><test>sample content</test></TESTTOOL>\``],
            },
            createInstance: config => new TestTool(config),
        })
    })

    it('should create a new CodyTool subclass', () => {
        const testTool = factory.createTool('TestTool')
        expect(testTool).toBeInstanceOf(CodyTool)
        expect(testTool).toBeInstanceOf(TestTool)
    })

    it('should generate correct instruction', () => {
        const testTool = factory.createTool('TestTool')
        const instruction = testTool?.getInstruction()
        expect(instruction).toEqual(
            ps`\`<TOOLTEST><test>TEST_CONTENT</test></TOOLTEST>\`: To test the CodyTool class.\n\t- Test the tool: \`<TESTTOOL><test>sample content</test></TESTTOOL>\``
        )
    })

    it('should stream and parse content correctly', async () => {
        const testTool = factory.createTool('TestTool')

        testTool?.stream('<TOOLTEST><test>first content</test></TOOLTEST>')
        testTool?.stream('<TOOLTEST><test>second content</test></TOOLTEST>')

        const result = await testTool?.run(mockSpan)
        expect(result?.map(r => r.content)).toEqual(['first content', 'second content'])
    })

    it('should handle multiple streams before parsing', async () => {
        const testTool = factory.createTool('TestTool')

        testTool?.stream('<TOOLTEST><test>part')
        testTool?.stream(' one</test></TOOLTEST>')
        testTool?.stream('<TOOLTEST><test>part two</test></TOOLTEST>')

        const result = await testTool?.run(mockSpan)

        expect(result?.map(r => r.content)).toEqual(['part one', 'part two'])
    })

    it('should reset after parsing', async () => {
        const testTool = factory.createTool('TestTool')

        testTool?.stream('<TOOLTEST><test>first content</test></TOOLTEST>')
        await testTool?.run(mockSpan)

        testTool?.stream('<TOOLTEST><test>second content</test></TOOLTEST>')
        const result = await testTool?.run(mockSpan)

        expect(result?.map(r => r.content)).toEqual(['second content'])
    })

    it('should handle empty or invalid content', async () => {
        const testTool = factory.createTool('TestTool')

        testTool?.stream('<TOOLTEST></TOOLTEST>')
        testTool?.stream('<TOOLTEST><test></test></TOOLTEST>')
        testTool?.stream('<TOOLTEST><invalid>content</invalid></TOOLTEST>')

        const result = await testTool?.run(mockSpan)

        expect(result).toEqual([])
    })

    it('should register and retrieve tools correctly', () => {
        const tools = factory.getInstances()
        expect(tools.length).toBeGreaterThan(0)
        expect(tools.some(t => t.config.title === 'TestTool')).toBeTruthy()
    })

    it('should create tool instances using the factory', () => {
        const testTool = factory.createTool('TestTool')
        expect(testTool).toBeDefined()
        expect(testTool).toBeInstanceOf(TestTool)
    })

    it('should return undefined for unregistered tools', () => {
        const unknownTool = factory.createTool('UnknownTool')
        expect(unknownTool).toBeUndefined()
    })

    it('should call callback when running tool with content', async () => {
        const testTool = factory.createTool('TestTool')

        testTool?.stream('<TOOLTEST><test>test content</test></TOOLTEST>')
        await testTool?.run(mockSpan, mockCallback)

        expect(mockCallback.onStream).toHaveBeenCalledWith('TestTool', 'test content')
    })

    it('should not call callback when running tool with empty content', async () => {
        const testTool = factory.createTool('TestTool')

        testTool?.stream('<TOOLTEST></TOOLTEST>')
        await testTool?.run(mockSpan, mockCallback)

        expect(mockCallback.onStream).not.toHaveBeenCalled()
    })

    describe('OpenCtxTool', () => {
        const mockProvider = {
            providerUri: 'test-provider',
            provider: {
                meta: {
                    name: 'TestProvider',
                },
            },
        }

        const mockConfig = {
            title: 'OpenCtx Test',
            tags: {
                tag: ps`TOOLCTX`,
                subTag: ps`ctx`,
            },
            prompt: {
                instruction: ps`Test OpenCtx provider`,
                placeholder: ps`CTX_QUERY`,
                examples: [ps`Test query: \`<TOOLCTX><ctx>query</ctx></TOOLCTX>\``],
            },
        }

        it('should create OpenCtxTool instance', () => {
            const openCtxTool = new OpenCtxTool(mockProvider as any, mockConfig)
            expect(openCtxTool).toBeInstanceOf(CodyTool)
        })
    })

    describe('Default Tools', () => {
        vi.mock('./CodyChatMemory', () => ({
            CodyChatMemory: {
                initialize: vi.fn(),
                retrieve: vi.fn(),
                load: vi.fn(),
                unload: vi.fn(),
            },
        }))

        // Update to use namespace-based approach
        beforeEach(() => {
            CodyToolProvider.initialize({ retrieveContext: vi.fn() })
        })

        it('should register all default tools based on toolbox settings', () => {
            const mockedToolboxSettings = { agent: { name: 'deep-cody' }, shell: { enabled: true } }
            vi.spyOn(toolboxManager, 'getSettings').mockReturnValue(mockedToolboxSettings)
            const localStorageData: { [key: string]: unknown } = {}
            mockLocalStorage({
                get: (key: string) => localStorageData[key],
                update: (key: string, value: unknown) => {
                    localStorageData[key] = value
                },
            } as any)

            const tools = CodyToolProvider.getTools()
            expect(tools.some(t => t.config.title.includes('Cody Memory'))).toBeTruthy()
            expect(tools.some(t => t.config.title.includes('Code Search'))).toBeTruthy()
            expect(tools.some(t => t.config.title.includes('Codebase File'))).toBeTruthy()
            expect(tools.some(t => t.config.title.includes('Terminal'))).toBeTruthy()

            // Disable shell and check if terminal tool is removed.
            mockedToolboxSettings.shell.enabled = false
            vi.spyOn(toolboxManager, 'getSettings').mockReturnValue(mockedToolboxSettings)
            const newTools = CodyToolProvider.getTools()
            expect(newTools.some(t => t.config.title.includes('Terminal'))).toBeFalsy()
            expect(newTools.length).toBe(tools.length - 1)
        })
    })
})
