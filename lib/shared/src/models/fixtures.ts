import type { Model } from './model'
import { ModelTag } from './tags'
import { ModelUsage } from './types'

export const FIXTURE_MODELS: Model[] = [
    {
        id: 'anthropic::2024-10-22::claude-3-5-sonnet-latest',
        modelRef: {
            providerId: 'anthropic',
            apiVersionId: '2024-10-22',
            modelId: 'claude-3-5-sonnet-latest',
        },
        usage: [ModelUsage.Edit, ModelUsage.Chat],
        contextWindow: {
            input: 15000,
            output: 4000,
            context: {
                user: 30000,
            },
        },
        tags: [ModelTag.Free, ModelTag.Balanced],
        provider: 'anthropic',
        title: 'Claude 3.5 Sonnet',
    },
    {
        id: 'anthropic::2023-06-01::claude-3-opus',
        modelRef: {
            providerId: 'anthropic',
            apiVersionId: '2023-06-01',
            modelId: 'claude-3-opus',
        },
        usage: [ModelUsage.Edit, ModelUsage.Chat],
        contextWindow: {
            input: 15000,
            output: 4000,
            context: {
                user: 30000,
            },
        },
        tags: [ModelTag.Pro, ModelTag.Other],
        provider: 'anthropic',
        title: 'Claude 3 Opus',
    },
    {
        id: 'anthropic::2023-06-01::claude-3-haiku',
        modelRef: {
            providerId: 'anthropic',
            apiVersionId: '2023-06-01',
            modelId: 'claude-3-haiku',
        },
        usage: [ModelUsage.Edit, ModelUsage.Chat],
        contextWindow: {
            input: 7000,
            output: 4000,
        },
        tags: [ModelTag.Free, ModelTag.Speed],
        provider: 'anthropic',
        title: 'Claude 3 Haiku',
    },
    {
        id: 'fireworks::v1::starcoder',
        modelRef: {
            providerId: 'fireworks',
            apiVersionId: 'v1',
            modelId: 'starcoder',
        },
        usage: [ModelUsage.Autocomplete],
        contextWindow: {
            input: 2048,
            output: 256,
        },
        tags: [ModelTag.Pro, ModelTag.Speed],
        provider: 'fireworks',
        title: 'StarCoder',
    },
    {
        id: 'fireworks::v1::deepseek-coder-v2-lite-base',
        modelRef: {
            providerId: 'fireworks',
            apiVersionId: 'v1',
            modelId: 'deepseek-coder-v2-lite-base',
        },
        usage: [ModelUsage.Autocomplete],
        contextWindow: {
            input: 2048,
            output: 256,
        },
        tags: [ModelTag.Pro, ModelTag.Speed],
        provider: 'fireworks',
        title: 'DeepSeek V2 Lite Base',
    },
    {
        id: 'google::v1::gemini-1.5-pro',
        modelRef: {
            providerId: 'google',
            apiVersionId: 'v1',
            modelId: 'gemini-1.5-pro',
        },
        usage: [ModelUsage.Edit, ModelUsage.Chat],
        contextWindow: {
            input: 15000,
            output: 4000,
            context: {
                user: 30000,
            },
        },
        tags: [ModelTag.Free, ModelTag.Balanced],
        provider: 'google',
        title: 'Gemini 1.5 Pro',
    },
    {
        id: 'google::v1::gemini-1.5-flash',
        modelRef: {
            providerId: 'google',
            apiVersionId: 'v1',
            modelId: 'gemini-1.5-flash',
        },
        usage: [ModelUsage.Edit, ModelUsage.Chat],
        contextWindow: {
            input: 15000,
            output: 4000,
            context: {
                user: 30000,
            },
        },
        tags: [ModelTag.Free, ModelTag.Speed],
        provider: 'google',
        title: 'Gemini 1.5 Flash',
    },
    {
        id: 'openai::2024-02-01::gpt-4o',
        modelRef: {
            providerId: 'openai',
            apiVersionId: '2024-02-01',
            modelId: 'gpt-4o',
        },
        usage: [ModelUsage.Edit, ModelUsage.Chat],
        contextWindow: {
            input: 15000,
            output: 4000,
            context: {
                user: 30000,
            },
        },
        tags: [ModelTag.Pro, ModelTag.Balanced],
        provider: 'openai',
        title: 'GPT-4o',
    },
]
