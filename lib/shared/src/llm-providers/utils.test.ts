import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BYOK_MODELS } from '../models/fixtures'
import { modelsService } from '../models/modelsService'
import { getCompletionsModelConfig } from './utils'

describe('getCompletionsModelConfig', () => {
    beforeEach(() => {
        // Reset mocks
        vi.resetAllMocks()
    })

    it('returns undefined for unknown model', () => {
        // Mock the modelsService.getModelByID to return undefined for unknown model
        vi.spyOn(modelsService, 'getModelByID').mockReturnValue(undefined)

        const config = getCompletionsModelConfig('unknown-model')
        expect(config).toBeUndefined()
    })

    it('returns correct config for BYOK model within LLM studio with groq provider', () => {
        // Get the test model from fixtures
        const testModel = BYOK_MODELS[0]

        // Mock the modelsService.getModelByID to return our test model
        vi.spyOn(modelsService, 'getModelByID').mockReturnValue(testModel)

        const config = getCompletionsModelConfig(testModel.id)

        // Verify the returned config matches what we expect
        expect(config).toEqual({
            model: 'deepseek-r1-distill-qwen-14b@4bit',
            key: '',
            endpoint: 'http://127.0.0.1:1234/v1/chat/completions',
            stream: true,
            options: {
                temperature: 0.1,
            },
        })
    })

    it('handles model ID with provider prefix correctly', () => {
        // Get the test model from fixtures
        const testModel = BYOK_MODELS[0]

        // Mock the modelsService.getModelByID to return our test model
        vi.spyOn(modelsService, 'getModelByID').mockReturnValue(testModel)

        const config = getCompletionsModelConfig(testModel.id)

        // Verify the model name has the provider prefix removed
        expect(config?.model).toBe('deepseek-r1-distill-qwen-14b@4bit')
    })

    it('handles model ID with providerId being uppercase', () => {
        // Get the test model from fixtures
        const testModel = BYOK_MODELS[1]

        // Mock the modelsService.getModelByID to return our test model
        vi.spyOn(modelsService, 'getModelByID').mockReturnValue(testModel)

        const config = getCompletionsModelConfig(testModel.id)

        // Verify the model name has the provider prefix removed
        expect(config?.model).toBe('gemma3:1b')
    })

    it('handles model ID with provider prefix and extra / correctly', () => {
        // Get the test model from fixtures
        const testModel = BYOK_MODELS[2]

        // Mock the modelsService.getModelByID to return our test model
        vi.spyOn(modelsService, 'getModelByID').mockReturnValue(testModel)

        const config = getCompletionsModelConfig(testModel.id)

        // Verify the model name has the provider prefix removed
        expect(config?.model).toBe('meta-llama/llama-4-instruct')
    })

    it('handles model ID without provider prefix correctly', () => {
        // Create a modified test model without provider prefix in ID
        const modifiedModel = {
            ...BYOK_MODELS[0],
            id: 'deepseek-r1-distill-qwen-14b@4bit', // ID without provider prefix
        }

        // Mock the modelsService.getModelByID to return our modified model
        vi.spyOn(modelsService, 'getModelByID').mockReturnValue(modifiedModel)

        const config = getCompletionsModelConfig(modifiedModel.id)

        // Verify the model name is unchanged
        expect(config?.model).toBe('deepseek-r1-distill-qwen-14b@4bit')
    })
})
