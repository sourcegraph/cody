import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatMessage } from '../chat/transcript/messages'
import { PromptMixin, newPromptMixin } from './prompt-mixin'
import { ps } from './prompt-string'

describe('PromptMixin', () => {
    // Reset static state before each test
    beforeEach(() => {
        // Access private static field using type assertion
        ;(PromptMixin as any).mixins = []
    })

    describe('mixInto', () => {
        const basicMessage: ChatMessage = {
            text: ps`Hello, world!`,
            speaker: 'human',
        }

        it('should return unmodified message when no mixins present', () => {
            const result = PromptMixin.mixInto(basicMessage, undefined, [])
            expect(result.text?.toString()).toBe('Hello, world!')
        })

        it('should apply hedging prevention for 3-5-sonnet model', () => {
            const result = PromptMixin.mixInto(basicMessage, '3-5-sonnet')
            expect(result.text?.toString()).toContain('Answer positively without apologizing')
        })

        it('should apply hedging prevention for 3.5-sonnet model', () => {
            const result = PromptMixin.mixInto(basicMessage, '3.5-sonnet')
            expect(result.text?.toString()).toContain('Answer positively without apologizing')
        })

        it('should not apply hedging prevention for other models', () => {
            const result = PromptMixin.mixInto(basicMessage, 'gpt-4')
            expect(result.text?.toString()).not.toContain('Answer positively without apologizing')
        })

        it('should apply Deep Cody format when enabled', () => {
            const result = PromptMixin.mixInto(basicMessage, undefined, [], true)
            expect(result.text?.toString()).toContain('[QUESTION]')
            expect(result.text?.toString()).toContain('Give step-by-step guide')
        })

        it('should handle empty message text', () => {
            const emptyMessage: ChatMessage = { text: ps``, speaker: 'human' }
            const result = PromptMixin.mixInto(emptyMessage, undefined)
            expect(result.text?.toString()).toBe('')
        })
    })

    describe('buildPrompt and message formatting', () => {
        const message: ChatMessage = {
            text: ps`Test message`,
            speaker: 'human',
        }

        it('should concatenate multiple mixins correctly', () => {
            const mixin1 = newPromptMixin(ps`First mixin`)
            const mixin2 = newPromptMixin(ps`Second mixin`)
            const result = PromptMixin.mixInto(message, undefined, [mixin1, mixin2])
            expect(result.text?.toString()).toContain('First mixin')
            expect(result.text?.toString()).toContain('Second mixin')
            expect(result.text?.toString()).toContain('Question: Test message')
        })

        it('should preserve message properties', () => {
            const complexMessage: ChatMessage = {
                text: ps`Test`,
                speaker: 'human',
            }
            const result = PromptMixin.mixInto(complexMessage, undefined)
            expect(result.speaker).toBe('human')
        })
    })

    describe('getContextMixin', () => {
        it('should return context preamble mixin', () => {
            const message: ChatMessage = { text: ps`Test`, speaker: 'human' }
            const contextMixin = PromptMixin.getContextMixin()
            const result = PromptMixin.mixInto(message, undefined, [contextMixin])
            expect(result.text?.toString()).toContain('You have access to the provided codebase context')
        })
    })

    describe('add and static mixins', () => {
        it('should add and apply static mixins', () => {
            const message: ChatMessage = { text: ps`Test`, speaker: 'human' }
            const mixin = newPromptMixin(ps`Static test mixin`)
            PromptMixin.add(mixin)
            const result = PromptMixin.mixInto(message, undefined)
            expect(result.text?.toString()).toContain('Static test mixin')
        })

        it('should maintain order of mixed prompts', () => {
            const message: ChatMessage = { text: ps`Test`, speaker: 'human' }
            const mixin1 = newPromptMixin(ps`First`)
            const mixin2 = newPromptMixin(ps`Second`)
            PromptMixin.add(mixin1)
            const result = PromptMixin.mixInto(message, undefined, [mixin2])
            const firstIndex = result.text?.toString().indexOf('First')
            const secondIndex = result.text?.toString().indexOf('Second')
            expect(firstIndex!).toBeLessThan(secondIndex!)
        })
    })

    describe('integration scenarios', () => {
        it('should combine all types of mixins correctly', () => {
            const message: ChatMessage = { text: ps`Test`, speaker: 'human' }
            const contextMixin = PromptMixin.getContextMixin()
            const customMixin = newPromptMixin(ps`Custom mixin`)
            PromptMixin.add(customMixin)

            const result = PromptMixin.mixInto(message, '3-5-sonnet', [contextMixin], true)

            expect(result.text?.toString()).toContain('You have access to the provided codebase context')
            expect(result.text?.toString()).toContain('Answer positively without apologizing')
            expect(result.text?.toString()).toContain('Custom mixin')
            expect(result.text?.toString()).toContain('[QUESTION]')
        })
    })

    describe('newPromptMixin function', () => {
        it('should create new mixin with given prompt string', () => {
            const promptStr = ps`Test prompt`
            const mixin = newPromptMixin(promptStr)
            const message: ChatMessage = { text: ps`Test`, speaker: 'human' }
            const result = PromptMixin.mixInto(message, undefined, [mixin])
            expect(result.text?.toString()).toContain('Test prompt')
        })

        it('should handle empty prompt string', () => {
            const mixin = newPromptMixin(ps``)
            const message: ChatMessage = { text: ps`Test`, speaker: 'human' }
            const result = PromptMixin.mixInto(message, undefined, [mixin])
            expect(result.text?.toString()).toBe('\n\nQuestion: Test')
        })
    })
})
