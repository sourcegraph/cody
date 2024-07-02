import { describe, expect, it, vi } from 'vitest'
import { ModelsService } from '../models'
import { getDotComDefaultModels } from '../models/dotcom'
import { ModelUsage } from '../models/types'
import { getCompletionsModelConfig } from './utils'

describe('getCompletionsModelConfig', () => {
    it('returns the correct model with no config for dotcom models', () => {
        const dotcomModels = getDotComDefaultModels()
        for (const model of dotcomModels) {
            const modelConfig = getCompletionsModelConfig(model.model)
            expect(modelConfig?.endpoint).toEqual(undefined)
            expect(modelConfig?.key).toEqual(undefined)
        }
    })
    it('returns undefined when model is not found', () => {
        const modelID = 'nonexistent-model'
        expect(getCompletionsModelConfig(modelID)).toBeUndefined()
    })

    it('returns the correct completions model config', () => {
        const model = {
            title: 'Olala Model',
            model: 'huggingface/olala-model',
            provider: 'HuggingFace',
            default: false,
            codyProOnly: true,
            usage: [ModelUsage.Chat, ModelUsage.Edit],
            contextWindow: { input: 100, output: 100 },
            deprecated: false,
            config: {
                apiKey: 'test-api-key',
                apiEndpoint: 'https://huggingface.com',
                model: 'olala-model',
            },
        }

        ModelsService.addModels([model])

        vi.spyOn(ModelsService, 'getModelByID').mockReturnValue(model)

        expect(getCompletionsModelConfig(model.model)).toEqual({
            key: 'test-api-key',
            endpoint: 'https://huggingface.com',
            model: 'olala-model',
        })
    })

    it('returns the correct completions model config when apiKey and apiEndpoint are missing', () => {
        const model = {
            title: 'Claude Instant Test',
            model: 'anthropic/claude-instant-test',
            provider: 'Anthropic',
            default: false,
            codyProOnly: true,
            usage: [ModelUsage.Chat, ModelUsage.Edit],
            contextWindow: { input: 100, output: 100 },
            deprecated: false,
            config: {
                apiKey: undefined,
                apiEndpoint: '',
            },
        }

        ModelsService.addModels([model])

        vi.spyOn(ModelsService, 'getModelByID').mockReturnValue(model)

        expect(getCompletionsModelConfig(model.model)).toEqual({
            endpoint: '',
            key: '',
            model: 'claude-instant-test',
        })
    })
})
