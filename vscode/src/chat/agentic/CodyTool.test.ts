import { ps } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import { CodyTool } from './CodyTool'

// Sample new CodyTool subclass for testing
class TestTool extends CodyTool {
    constructor() {
        super({
            tags: {
                tag: ps`TESTTOOL`,
                subTag: ps`test`,
            },
            prompt: {
                instruction: ps`To test the CodyTool class`,
                placeholder: ps`TEST_CONTENT`,
                example: ps`Test the tool: \`<TESTTOOL><test>sample content</test></TESTTOOL>\``,
            },
        })
    }

    public async execute(): Promise<any[]> {
        return this.parse()
    }
}

describe('CodyTool', () => {
    it('should create a new CodyTool subclass', () => {
        const testTool = new TestTool()
        expect(testTool).toBeInstanceOf(CodyTool)
        expect(testTool).toBeInstanceOf(TestTool)
    })

    it('should generate correct instruction', () => {
        const testTool = new TestTool()
        const instruction = testTool.getInstruction()
        expect(instruction).toEqual(
            ps`To test the CodyTool class: \`<TESTTOOL><test>TEST_CONTENT</test></TESTTOOL>\``
        )
    })

    it('should stream and parse content correctly', async () => {
        const testTool = new TestTool()

        testTool.stream('<TESTTOOL><test>first content</test></TESTTOOL>')
        testTool.stream('<TESTTOOL><test>second content</test></TESTTOOL>')

        const result = await testTool.execute()

        expect(result).toEqual(['first content', 'second content'])
    })

    it('should handle multiple streams before parsing', async () => {
        const testTool = new TestTool()

        testTool.stream('<TESTTOOL><test>part')
        testTool.stream(' one</test></TESTTOOL>')
        testTool.stream('<TESTTOOL><test>part two</test></TESTTOOL>')

        const result = await testTool.execute()

        expect(result).toEqual(['part one', 'part two'])
    })

    it('should reset after parsing', async () => {
        const testTool = new TestTool()

        testTool.stream('<TESTTOOL><test>first content</test></TESTTOOL>')
        await testTool.execute()

        testTool.stream('<TESTTOOL><test>second content</test></TESTTOOL>')
        const result = await testTool.execute()

        expect(result).toEqual(['second content'])
    })

    it('should handle empty or invalid content', async () => {
        const testTool = new TestTool()

        testTool.stream('<TESTTOOL></TESTTOOL>')
        testTool.stream('<TESTTOOL><test></test></TESTTOOL>')
        testTool.stream('<TESTTOOL><invalid>content</invalid></TESTTOOL>')

        const result = await testTool.execute()

        expect(result).toEqual([])
    })
})
