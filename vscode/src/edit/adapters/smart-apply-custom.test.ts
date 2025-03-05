import { describe, expect, it } from 'vitest'
import { SmartApplyCustomModelParameterProvider } from './smart-apply-custom'
import type { ModelParametersInput } from './base'

describe('SmartApplyCustomModelParameterProvider', () => {
    const provider = new SmartApplyCustomModelParameterProvider()

    it('should return model parameters with smart apply configuration', () => {
        const input: ModelParametersInput = {
            model: 'gpt-4',
            contextWindow: { input: 1000, output: 500 },
            task: {
                original: 'test task',
                smartApplyMetadata: {
                    replacementCodeBlock: 'const test = "hello"',
                },
            } as any,
        }

        const result = provider.getModelParameters(input)

        expect(result).toEqual({
            model: 'gpt-4',
            maxTokensToSample: 500,
            temperature: 0.1,
            stream: true,
            prediction: {
                type: 'content',
                content: 'const test = "hello"',
            },
            rewriteSpeculation: true,
            adaptiveSpeculation: true,
        })
    })

    it('should include stop sequences when provided', () => {
        const input: ModelParametersInput = {
            model: 'gpt-4',
            stopSequences: ['\n', 'END'],
            contextWindow: { input: 1000, output: 500 },
            task: {
                original: 'test task',
                smartApplyMetadata: {
                    replacementCodeBlock: 'const test = "hello"',
                },
            } as any,
        }

        const result = provider.getModelParameters(input)

        expect(result).toEqual({
            model: 'gpt-4',
            stopSequences: ['\n', 'END'],
            maxTokensToSample: 500,
            temperature: 0.1,
            stream: true,
            prediction: {
                type: 'content',
                content: 'const test = "hello"',
            },
            rewriteSpeculation: true,
            adaptiveSpeculation: true,
        })
    })

    it('should throw error when smart apply metadata is missing', () => {
        const input: ModelParametersInput = {
            model: 'gpt-4',
            contextWindow: { input: 1000, output: 500 },
            task: {
                original: 'test task',
            } as any,
        }

        expect(() => provider.getModelParameters(input)).toThrow(
            'Smart apply metadata is required for smart apply custom model'
        )
    })

    it('should handle empty replacement code block', () => {
        const input: ModelParametersInput = {
            model: 'gpt-4',
            contextWindow: { input: 1000, output: 500 },
            task: {
                original: 'test task',
                smartApplyMetadata: {
                    replacementCodeBlock: '',
                },
            } as any,
        }

        const result = provider.getModelParameters(input)

        expect(result).toEqual({
            model: 'gpt-4',
            maxTokensToSample: 500,
            temperature: 0.1,
            stream: true,
            prediction: {
                type: 'content',
                content: '',
            },
            rewriteSpeculation: true,
            adaptiveSpeculation: true,
        })
    })
})
