import { beforeEach, describe, expect, test, vi } from 'vitest'
import { type ChatMessage, type ChatModel, PromptMixin, ps } from '..'

describe('PromptMixin', () => {
    interface TestCase {
        name: string
        input: {
            message: ChatMessage
            modelID?: ChatModel
            newMixins?: PromptMixin[]
        }
        expected: string
        setup?: () => void
    }

    const testCases: TestCase[] = [
        {
            name: 'basic message without mixins',
            input: {
                message: { speaker: 'human', text: ps`Hello` },
            },
            expected: 'Hello',
        },
        {
            name: 'message with hedging prevention for apologetic model',
            input: {
                message: { speaker: 'assistant', text: ps`Hello` },
                modelID: '3.5-sonnet',
            },
            expected: 'Answer positively without apologizing.\n\nQuestion: Hello',
        },
        {
            name: 'deep-cody agent message - no mixins',
            input: {
                message: { speaker: 'human', text: ps`How to code?`, agent: 'deep-cody' },
            },
            expected: 'How to code?',
        },
        {
            name: 'deep-cody agent message with custom mixin',
            input: {
                message: { speaker: 'human', text: ps`How to code?`, agent: 'deep-cody' },
                newMixins: [new PromptMixin(ps`Review <input>{{USER_INPUT_TEXT}}</input>`)],
            },
            expected: 'Review <input>How to code?</input>',
        },
        {
            name: 'message with context mixin',
            input: {
                message: { speaker: 'assistant', text: ps`Hello` },
            },
            expected: 'You have access to the provided codebase context.\n\nQuestion: Hello',
            setup: () => {
                PromptMixin.add(PromptMixin.getContextMixin())
            },
        },
        {
            name: 'message with multiple mixins',
            input: {
                message: { speaker: 'human', text: ps`Hello` },
                modelID: '3.5-sonnet',
                newMixins: [new PromptMixin(ps`Custom instruction.`)],
            },
            expected:
                'You have access to the provided codebase context. \n\nAnswer positively without apologizing. \n\nCustom instruction.\n\nQuestion: Hello',
        },
    ]

    beforeEach(() => {
        // Reset static state between tests
        vi.clearAllMocks()
    })

    test.each(testCases)('$name', ({ input, expected, setup }) => {
        if (setup) {
            setup()
        }

        const result = PromptMixin.mixInto(input.message, input.modelID, input.newMixins)

        expect(result.text?.toString()).toBe(expected)
    })
})
