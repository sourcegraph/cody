import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelsService } from '../models'
import { useCustomChatClient } from './clients'

import {
    type CompletionCallbacks,
    type CompletionParameters,
    ModelUsage,
    getDotComDefaultModels,
} from '..'

describe('useCustomChatClient', () => {
    const codygatewayModels = getDotComDefaultModels()
    const mockCompletionsEndpoint = 'https://example.com/completions'
    const mockParams: CompletionParameters = {
        model: 'olala/test-model',
        messages: [],
        maxTokensToSample: 1,
    }
    const mockCallbacks: CompletionCallbacks = {
        onChange: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
    }

    afterEach(() => {
        vi.resetAllMocks()
    })

    it('returns false when model is not found', async () => {
        vi.spyOn(ModelsService, 'getModelByID').mockReturnValue(undefined)

        const result = await useCustomChatClient(mockCompletionsEndpoint, mockParams, mockCallbacks)

        expect(result).toBe(false)
    })

    it('returns false when model is a Cody Gateway model', async () => {
        vi.spyOn(ModelsService, 'getModelByID').mockReturnValue(codygatewayModels[0])

        const result = await useCustomChatClient(mockCompletionsEndpoint, mockParams, mockCallbacks)

        expect(result).toBe(false)
    })

    it('calls the correct client based on the model provider - google', async () => {
        const nonGatewayModel = [
            {
                title: 'Gemini 1.5 Pro',
                model: 'google/gemini-1.5-pro-latest',
                provider: 'Google',
                default: false,
                codyProOnly: true,
                usage: [ModelUsage.Chat],
                contextWindow: { input: 1, output: 1 },
                deprecated: false,
            },
        ]
        ModelsService.addModels(nonGatewayModel)

        vi.spyOn(ModelsService, 'getModelByID').mockReturnValue(nonGatewayModel[0])
        const result = await useCustomChatClient(mockCompletionsEndpoint, mockParams, mockCallbacks)
        const mockChatClient = vi.fn()
        vi.doMock('./google', () => ({
            googleChatClient: mockChatClient,
        }))

        await useCustomChatClient(mockCompletionsEndpoint, mockParams, mockCallbacks)
        expect(result).toBe(true)
    })

    // TODO mock the ollama chat client properly
    it.skip('returns true when a matching client is found and called', async () => {
        const mockModel = { provider: 'Ollama' }
        vi.spyOn(ModelsService, 'getModelByID').mockReturnValue(mockModel as any)
        const mockOllamaChatClient = vi.fn()
        vi.doMock('./ollama', () => ({ ollamaChatClient: mockOllamaChatClient }))
        const result = await useCustomChatClient(mockCompletionsEndpoint, mockParams, mockCallbacks)
        expect(result).toBe(true)
    })

    it('returns false when no matching client is found', async () => {
        vi.spyOn(ModelsService, 'getModelByID').mockReturnValue(undefined)
        const result = await useCustomChatClient(mockCompletionsEndpoint, mockParams, mockCallbacks)
        expect(result).toBe(false)
    })
})
