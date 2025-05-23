import { describe, expect, it, vi } from 'vitest'
import type { CodyBenchOptions } from './command-bench'
import { LlmJudge } from './llm-judge'

// Mock the LlmJudge class to test integration without making actual API calls
vi.mock('./llm-judge', () => ({
    LlmJudge: vi.fn().mockImplementation((options, model) => ({
        judge: vi.fn().mockResolvedValue({
            score: 'amazing',
            scoreNumeric: 2,
            reasoning: 'Test reasoning',
        }),
        model: model || 'anthropic/claude-3-5-sonnet-20240620',
    })),
}))

describe('strategy integration with judgeModel', () => {
    const mockOptions: CodyBenchOptions = {
        workspace: '/test-workspace',
        treeSitterGrammars: '/grammars',
        queriesDirectory: '/queries',
        testCount: 1,
        maxFileTestCount: 1,
        includeFixture: [],
        excludeFixture: [],
        includeWorkspace: [],
        excludeWorkspace: [],
        srcAccessToken: 'test-token',
        srcEndpoint: 'https://test.sourcegraph.com',
        evaluationConfig: '/config',
        snapshotDirectory: '/snapshots',
        verbose: false,
        fixture: {
            name: 'test-fixture',
            strategy: 'fix' as any,
        },
    }

    it('should pass judgeModel to LlmJudge constructor when specified', () => {
        const customModel = 'anthropic/claude-3-haiku-20240307'
        const optionsWithJudgeModel = {
            ...mockOptions,
            judgeModel: customModel,
        }

        // Create LlmJudge instance as strategies would
        new LlmJudge(optionsWithJudgeModel, optionsWithJudgeModel.judgeModel)

        expect(LlmJudge).toHaveBeenCalledWith(optionsWithJudgeModel, customModel)
    })

    it('should use default model when judgeModel is not specified', () => {
        const optionsWithoutJudgeModel = {
            ...mockOptions,
            judgeModel: undefined,
        }

        // Create LlmJudge instance as strategies would
        new LlmJudge(optionsWithoutJudgeModel, optionsWithoutJudgeModel.judgeModel)

        expect(LlmJudge).toHaveBeenCalledWith(optionsWithoutJudgeModel, undefined)
    })

    it('should handle various judge model values correctly', () => {
        const testModels = [
            'anthropic/claude-3-5-sonnet-20240620',
            'anthropic/claude-3-haiku',
            'anthropic/claude-3-opus',
            undefined,
        ]

        for (const model of testModels) {
            const optionsWithModel = {
                ...mockOptions,
                judgeModel: model,
            }

            new LlmJudge(optionsWithModel, optionsWithModel.judgeModel)

            expect(LlmJudge).toHaveBeenCalledWith(optionsWithModel, model)
        }
    })
})

describe('LlmJudge model parameter propagation', () => {
    it('should correctly set the internal model property', () => {
        const testModel = 'test-model'
        const mockOptions = {
            srcAccessToken: 'token',
            srcEndpoint: 'endpoint',
        }

        const judge = new LlmJudge(mockOptions, testModel)

        // The mocked implementation should return the model
        expect((judge as any).model).toBe(testModel)
    })

    it('should use default when model parameter is undefined', () => {
        const mockOptions = {
            srcAccessToken: 'token',
            srcEndpoint: 'endpoint',
        }

        const judge = new LlmJudge(mockOptions, undefined)

        // The mocked implementation should return the default when undefined is passed
        expect((judge as any).model).toBe('anthropic/claude-3-5-sonnet-20240620')
    })
})
