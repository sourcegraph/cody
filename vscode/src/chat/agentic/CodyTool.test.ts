import { ps } from '@sourcegraph/cody-shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { CodyTool } from './CodyTool'
import { ToolFactory } from './CodyToolProvider'

class TestTool extends CodyTool {
    public async execute(): Promise<any[]> {
        return this.getParsed()
    }
}

describe('CodyTool', () => {
    let factory: ToolFactory
    let mockSpan: any

    beforeEach(() => {
        factory = new ToolFactory()
        mockSpan = {}
        factory.registry.register({
            name: 'TestTool',
            tags: {
                tag: ps`TESTTOOL`,
                subTag: ps`test`,
            },
            prompt: {
                instruction: ps`To test the CodyTool class`,
                placeholder: ps`TEST_CONTENT`,
                example: ps`Test the tool: \`<TESTTOOL><test>sample content</test></TESTTOOL>\``,
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
            ps`To test the CodyTool class: \`<TESTTOOL><test>TEST_CONTENT</test></TESTTOOL>\``
        )
    })

    it('should stream and parse content correctly', async () => {
        const testTool = factory.createTool('TestTool')

        testTool?.stream('<TESTTOOL><test>first content</test></TESTTOOL>')
        testTool?.stream('<TESTTOOL><test>second content</test></TESTTOOL>')

        const result = await testTool?.execute(mockSpan)

        expect(result).toEqual(['first content', 'second content'])
    })

    it('should handle multiple streams before parsing', async () => {
        const testTool = factory.createTool('TestTool')

        testTool?.stream('<TESTTOOL><test>part')
        testTool?.stream(' one</test></TESTTOOL>')
        testTool?.stream('<TESTTOOL><test>part two</test></TESTTOOL>')

        const result = await testTool?.execute(mockSpan)

        expect(result).toEqual(['part one', 'part two'])
    })

    it('should reset after parsing', async () => {
        const testTool = factory.createTool('TestTool')

        testTool?.stream('<TESTTOOL><test>first content</test></TESTTOOL>')
        await testTool?.execute(mockSpan)

        testTool?.stream('<TESTTOOL><test>second content</test></TESTTOOL>')
        const result = await testTool?.execute(mockSpan)

        expect(result).toEqual(['second content'])
    })

    it('should handle empty or invalid content', async () => {
        const testTool = factory.createTool('TestTool')

        testTool?.stream('<TESTTOOL></TESTTOOL>')
        testTool?.stream('<TESTTOOL><test></test></TESTTOOL>')
        testTool?.stream('<TESTTOOL><invalid>content</invalid></TESTTOOL>')

        const result = await testTool?.execute(mockSpan)

        expect(result).toEqual([])
    })

    it('should register and retrieve tools correctly', () => {
        const toolConfig = factory.registry.get('TestTool')
        expect(toolConfig).toBeDefined()
        expect(toolConfig?.name).toBe('TestTool')
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
})
