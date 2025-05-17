import { TokenCounterUtils, ps } from '@sourcegraph/cody-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { CustomModelSelectionProvider } from '../prompt/smart-apply/selection/custom-model'
import type { ModelParametersInput } from './base'
import { SmartApplyCustomModelParameterProvider } from './smart-apply-custom'

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

describe('CustomModelSelectionProvider token count validation', () => {
    beforeEach(() => {
        vi.spyOn(TokenCounterUtils, 'countPromptString').mockImplementation(async () => 1500)

        vi.spyOn(vscode, 'Range').mockImplementation(() => ({}) as vscode.Range)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('should throw an error when token count exceeds context window input limit', async () => {
        const mockDocument = {
            lineCount: 100,
            uri: { fsPath: 'test.ts' },
            getText: vi.fn().mockReturnValue('mock document text'),
        } as unknown as vscode.TextDocument

        // Mock token count to exceed context window input
        const contextWindow = { input: 1000, output: 500 }

        const provider = new CustomModelSelectionProvider({ shouldAlwaysUseEntireFile: false })

        await expect(
            provider.getSelectedText({
                instruction: ps`test instruction`,
                replacement: ps`test replacement`,
                document: mockDocument,
                model: 'gpt-4',
                chatClient: {} as any,
                contextWindow,
                codyApiVersion: 1,
            })
        ).rejects.toThrow("The amount of text in this document exceeds Cody's current capacity.")

        // Verify the token counter was called with the document text
        expect(TokenCounterUtils.countPromptString).toHaveBeenCalled()
    })
})
