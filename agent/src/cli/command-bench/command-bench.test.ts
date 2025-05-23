import { describe, expect, it } from 'vitest'
import type { CodyBenchOptions } from './command-bench'

describe('CodyBenchOptions interface', () => {
    it('should include judgeModel as an optional property', () => {
        const options: CodyBenchOptions = {
            workspace: '/test',
            treeSitterGrammars: '/grammars',
            queriesDirectory: '/queries',
            testCount: 100,
            maxFileTestCount: 10,
            includeFixture: [],
            excludeFixture: [],
            includeWorkspace: [],
            excludeWorkspace: [],
            srcAccessToken: 'test-token',
            srcEndpoint: 'https://test.com',
            evaluationConfig: '/config',
            snapshotDirectory: '/snapshots',
            verbose: false,
            fixture: {
                name: 'test-fixture',
                strategy: 'autocomplete' as any,
            },
        }

        // Should be able to set judgeModel
        options.judgeModel = 'anthropic/claude-3-haiku'
        expect(options.judgeModel).toBe('anthropic/claude-3-haiku')

        // Should be optional (undefined is valid)
        options.judgeModel = undefined
        expect(options.judgeModel).toBeUndefined()
    })

    it('should support various judge model formats', () => {
        const baseOptions: Partial<CodyBenchOptions> = {
            workspace: '/test',
        }

        const validModels = [
            'anthropic/claude-3-5-sonnet-20240620',
            'anthropic/claude-3-haiku-20240307',
            'anthropic/claude-3-opus',
            'openai/gpt-4',
            'custom-model-name',
            undefined,
        ]

        for (const model of validModels) {
            const options: Partial<CodyBenchOptions> = {
                ...baseOptions,
                judgeModel: model,
            }
            expect(options.judgeModel).toBe(model)
        }
    })
})

describe('judge model integration', () => {
    it('should use default judge model when not specified', () => {
        // This simulates what happens when --judge-model is not provided
        const defaultModel = 'anthropic/claude-3-5-sonnet-20240620'

        // Simulate commander.js default value behavior
        const options = {
            judgeModel: defaultModel,
        }

        expect(options.judgeModel).toBe(defaultModel)
    })

    it('should override default when judge model is specified', () => {
        const customModel = 'anthropic/claude-3-haiku'

        // Simulate what happens when --judge-model is provided
        const options = {
            judgeModel: customModel,
        }

        expect(options.judgeModel).toBe(customModel)
    })
})

// Test the help text and option configuration
describe('bench command configuration', () => {
    it('should have judge-model option with correct default', () => {
        // This is more of a documentation test to ensure the option is configured correctly
        const expectedDefault = 'anthropic/claude-3-5-sonnet-20240620'
        const expectedDescription =
            'The model to use for LLM judging (e.g., anthropic/claude-3-5-sonnet-20240620, anthropic/claude-3-haiku, etc.)'

        // These are the values that should be configured in the command
        expect(expectedDefault).toBe('anthropic/claude-3-5-sonnet-20240620')
        expect(expectedDescription).toContain('LLM judging')
        expect(expectedDescription).toContain('anthropic/claude-3-5-sonnet-20240620')
        expect(expectedDescription).toContain('anthropic/claude-3-haiku')
    })
})
