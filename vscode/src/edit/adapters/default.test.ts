import { describe, expect, it, vi } from 'vitest'
import { modelsService } from '@sourcegraph/cody-shared'
import { DefaultModelParameterProvider } from './default'
import type { ModelParametersInput } from './base'

describe('DefaultModelParameterProvider', () => {
    const provider = new DefaultModelParameterProvider()

    it('should return basic model parameters', () => {
        const input: ModelParametersInput = {
            model: 'gpt-4',
            contextWindow: { input: 1000, output: 500 },
            task: { original: 'test task' } as any,
        }

        const result = provider.getModelParameters(input)

        expect(result).toEqual({
            model: 'gpt-4',
            maxTokensToSample: 500,
        })
    })

    it('should include stop sequences when provided', () => {
        const input: ModelParametersInput = {
            model: 'gpt-4',
            stopSequences: ['\n', 'END'],
            contextWindow: { input: 1000, output: 500 },
            task: { original: 'test task' } as any,
        }

        const result = provider.getModelParameters(input)

        expect(result).toEqual({
            model: 'gpt-4',
            stopSequences: ['\n', 'END'],
            maxTokensToSample: 500,
        })
    })

    it('should include prediction for gpt-4o models', () => {
        const input: ModelParametersInput = {
            model: 'gpt-4o',
            contextWindow: { input: 1000, output: 500 },
            task: { original: 'test task' } as any,
        }

        const result = provider.getModelParameters(input)

        expect(result).toEqual({
            model: 'gpt-4o',
            maxTokensToSample: 500,
            prediction: {
                type: 'content',
                content: 'test task',
            },
        })
    })

    it('should disable streaming for specific models', () => {
        // Mock the isStreamDisabled function
        vi.spyOn(modelsService, 'isStreamDisabled').mockReturnValue(true)

        const input: ModelParametersInput = {
            model: 'gpt-4',
            contextWindow: { input: 1000, output: 500 },
            task: { original: 'test task' } as any,
        }

        const result = provider.getModelParameters(input)

        expect(result).toEqual({
            model: 'gpt-4',
            maxTokensToSample: 500,
            stream: false,
        })

        // Restore the mock
        vi.restoreAllMocks()
    })

    it('should handle combined cases', () => {
        // Mock the isStreamDisabled function
        vi.spyOn(modelsService, 'isStreamDisabled').mockReturnValue(true)

        const input: ModelParametersInput = {
            model: 'gpt-4o',
            stopSequences: ['\n', 'END'],
            contextWindow: { input: 1000, output: 500 },
            task: { original: 'test task' } as any,
        }

        const result = provider.getModelParameters(input)

        expect(result).toEqual({
            model: 'gpt-4o',
            stopSequences: ['\n', 'END'],
            maxTokensToSample: 500,
            prediction: {
                type: 'content',
                content: 'test task',
            },
            stream: false,
        })

        // Restore the mock
        vi.restoreAllMocks()
    })
})
