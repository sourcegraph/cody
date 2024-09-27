import { type Model, type ServerModel, createModelFromServerModel } from './model'
import type { ServerModelConfiguration } from './modelsService'
import type { ModelTag } from './tags'

/**
 * Copy of the DotCom model configuration API response from Sep 26 2024.
 */
const MOCKED_SERVER_MODELS_CONFIG = {
    schemaVersion: '1.0',
    revision: '0.0.0+dev',
    providers: [
        {
            id: 'anthropic',
            displayName: 'Anthropic',
        },
        {
            id: 'fireworks',
            displayName: 'Fireworks',
        },
        {
            id: 'google',
            displayName: 'Google',
        },
        {
            id: 'openai',
            displayName: 'OpenAI',
        },
        {
            id: 'mistral',
            displayName: 'Mistral',
        },
    ],
    models: [
        {
            modelRef: 'anthropic::2023-06-01::claude-3.5-sonnet',
            displayName: 'Claude 3.5 Sonnet',
            modelName: 'claude-3-5-sonnet-20240620',
            capabilities: ['edit', 'chat'],
            category: 'balanced' as ModelTag.Balanced,
            status: 'stable',
            tier: 'free' as ModelTag.Free,
            contextWindow: {
                maxInputTokens: 45000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'anthropic::2023-06-01::claude-3-opus',
            displayName: 'Claude 3 Opus',
            modelName: 'claude-3-opus-20240229',
            capabilities: ['edit', 'chat'],
            category: 'other',
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 45000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'anthropic::2023-06-01::claude-3-haiku',
            displayName: 'Claude 3 Haiku',
            modelName: 'claude-3-haiku-20240307',
            capabilities: ['edit', 'chat'],
            category: 'speed' as ModelTag.Speed,
            status: 'stable',
            tier: 'free' as ModelTag.Free,
            contextWindow: {
                maxInputTokens: 7000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'fireworks::v1::starcoder',
            displayName: 'StarCoder',
            modelName: 'starcoder',
            capabilities: ['autocomplete'],
            category: 'speed' as ModelTag.Speed,
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 2048,
                maxOutputTokens: 256,
            },
        },
        {
            modelRef: 'fireworks::v1::deepseek-coder-v2-lite-base',
            displayName: 'DeepSeek V2 Lite Base',
            modelName: 'accounts/sourcegraph/models/deepseek-coder-v2-lite-base',
            capabilities: ['autocomplete'],
            category: 'speed' as ModelTag.Speed,
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 2048,
                maxOutputTokens: 256,
            },
        },
        {
            modelRef: 'google::v1::gemini-1.5-pro',
            displayName: 'Gemini 1.5 Pro',
            modelName: 'gemini-1.5-pro',
            capabilities: ['edit', 'chat'],
            category: 'balanced' as ModelTag.Balanced,
            status: 'stable',
            tier: 'free' as ModelTag.Free,
            contextWindow: {
                maxInputTokens: 45000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'google::v1::gemini-1.5-flash',
            displayName: 'Gemini 1.5 Flash',
            modelName: 'gemini-1.5-flash',
            capabilities: ['edit', 'chat'],
            category: 'speed' as ModelTag.Speed,
            status: 'stable',
            tier: 'free' as ModelTag.Free,
            contextWindow: {
                maxInputTokens: 45000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'openai::2024-02-01::gpt-4o',
            displayName: 'GPT-4o',
            modelName: 'gpt-4o',
            capabilities: ['edit', 'chat'],
            category: 'balanced' as ModelTag.Balanced,
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 45000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'openai::2024-02-01::cody-chat-preview-001',
            displayName: 'OpenAI o1-preview',
            modelName: 'cody-chat-preview-001',
            capabilities: ['chat'],
            category: 'accuracy',
            status: 'waitlist' as ModelTag.Waitlist,
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 45000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'openai::2024-02-01::cody-chat-preview-002',
            displayName: 'OpenAI o1-mini',
            modelName: 'cody-chat-preview-002',
            capabilities: ['chat'],
            category: 'accuracy',
            status: 'waitlist' as ModelTag.Waitlist,
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 45000,
                maxOutputTokens: 4000,
            },
        },
    ],
    defaultModels: {
        chat: 'anthropic::2023-06-01::claude-3.5-sonnet',
        fastChat: 'anthropic::2023-06-01::claude-3-haiku',
        codeCompletion: 'fireworks::v1::deepseek-coder-v2-lite-base',
    },
} as const satisfies ServerModelConfiguration

export function getMockedDotComClientModels(): Model[] {
    return MOCKED_SERVER_MODELS_CONFIG.models.map(createModelFromServerModel)
}

export function getMockedDotComServerModels(): ServerModel[] {
    return MOCKED_SERVER_MODELS_CONFIG.models
}
