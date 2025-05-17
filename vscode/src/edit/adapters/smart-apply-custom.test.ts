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
    const mockChatClient = {
        getCompletion: vi.fn().mockResolvedValue('ENTIRE_FILE'),
    } as any

    beforeEach(() => {
        vi.spyOn(vscode, 'Range').mockImplementation(() => ({}) as vscode.Range)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('should throw an error when token count exceeds context window input limit', async () => {
        // Mock token count to exceed limit
        vi.spyOn(TokenCounterUtils, 'countPromptString').mockImplementation(async () => 1500)

        const mockDocumentText = 'mock document text that exceeds token limit'
        const mockDocument = {
            lineCount: 100,
            uri: { fsPath: 'test.ts' },
            getText: vi.fn().mockReturnValue(mockDocumentText),
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

        // Verify the token counter was called with the correct document text
        expect(TokenCounterUtils.countPromptString).toHaveBeenCalledTimes(1)
        const calledWith = vi.mocked(TokenCounterUtils.countPromptString).mock.calls[0][0]
        expect(calledWith).toBeDefined()
        expect(calledWith.toString()).toContain(mockDocumentText)
    })

    it('should return ENTIRE_FILE when token count is within limits and below threshold', async () => {
        // Mock token count to be within limit but below threshold
        vi.spyOn(TokenCounterUtils, 'countPromptString').mockImplementation(async () => 800)

        const mockDocumentText = 'mock document text within token limit'
        const mockDocument = {
            lineCount: 100,
            uri: { fsPath: 'test.ts' },
            getText: vi.fn().mockReturnValue(mockDocumentText),
        } as unknown as vscode.TextDocument

        const contextWindow = { input: 1000, output: 500 }

        const provider = new CustomModelSelectionProvider({ shouldAlwaysUseEntireFile: false })

        const result = await provider.getSelectedText({
            instruction: ps`test instruction`,
            replacement: ps`test replacement`,
            document: mockDocument,
            model: 'gpt-4',
            chatClient: mockChatClient,
            contextWindow,
            codyApiVersion: 1,
        })

        // Verify result is ENTIRE_FILE when token count is below threshold
        expect(result).toBe('ENTIRE_FILE')

        // Verify the token counter was called with the correct document text
        expect(TokenCounterUtils.countPromptString).toHaveBeenCalledTimes(1)
        const calledWith = vi.mocked(TokenCounterUtils.countPromptString).mock.calls[0][0]
        expect(calledWith).toBeDefined()
        expect(calledWith.toString()).toContain(mockDocumentText)
    })

    it('should always return ENTIRE_FILE when shouldAlwaysUseEntireFile is true regardless of token count', async () => {
        // Mock token count to be above threshold but within limit
        vi.spyOn(TokenCounterUtils, 'countPromptString').mockImplementation(async () => 15000)

        const mockDocumentText = 'mock document text above threshold'
        const mockDocument = {
            lineCount: 100,
            uri: { fsPath: 'test.ts' },
            getText: vi.fn().mockReturnValue(mockDocumentText),
        } as unknown as vscode.TextDocument

        const contextWindow = { input: 20000, output: 500 } // Large enough to not trigger error

        // Create provider instance with shouldAlwaysUseEntireFile set to true
        const provider = new CustomModelSelectionProvider({ shouldAlwaysUseEntireFile: true })

        const result = await provider.getSelectedText({
            instruction: ps`test instruction`,
            replacement: ps`test replacement`,
            document: mockDocument,
            model: 'gpt-4',
            chatClient: mockChatClient,
            contextWindow,
            codyApiVersion: 1,
        })

        // Verify result is ENTIRE_FILE when shouldAlwaysUseEntireFile is true
        expect(result).toBe('ENTIRE_FILE')

        // Verify the token counter was called with the correct document text
        expect(TokenCounterUtils.countPromptString).toHaveBeenCalledTimes(1)
        const calledWith = vi.mocked(TokenCounterUtils.countPromptString).mock.calls[0][0]
        expect(calledWith).toBeDefined()
        expect(calledWith.toString()).toContain(mockDocumentText)
    })
})
