import type { Model } from './model'
import { ModelTag } from './tags'
import { ModelUsage } from './types'

export const BYOK_MODELS: Model[] = [
    {
        id: 'groq/deepseek-r1-distill-qwen-14b@4bit',
        modelRef: {
            providerId: 'groq',
            apiVersionId: 'unknown',
            modelId: 'deepseek r1 distill qwen 14b@4bit',
        },
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: {
            input: 128000,
            output: 8192,
        },
        clientSideConfig: {
            apiKey: undefined,
            apiEndpoint: 'http://127.0.0.1:1234/v1/chat/completions',
            options: {
                temperature: 0.1,
            },
        },
        tags: [ModelTag.Local, ModelTag.BYOK, ModelTag.Experimental],
        provider: 'groq',
        title: 'deepseek r1 distill qwen 14b@4bit',
    },
    {
        id: 'ollama/gemma3:1b',
        modelRef: {
            providerId: 'Ollama',
            apiVersionId: 'unknown',
            modelId: 'gemma3:1b',
        },
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: {
            input: 2048,
            output: 4000,
        },
        clientSideConfig: undefined,
        tags: [ModelTag.Local, ModelTag.BYOK, ModelTag.Experimental],
        provider: 'Ollama',
        title: 'gemma3:1b',
    },
    {
        id: 'groq/meta-llama/llama-4-instruct',
        modelRef: {
            providerId: 'groq',
            apiVersionId: 'unknown',
            modelId: 'llama 4 scout instruct',
        },
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: {
            input: 40960,
            output: 8192,
        },
        clientSideConfig: {
            apiKey: '',
            apiEndpoint: undefined,
            options: {
                temperature: 0.1,
            },
        },
        tags: [ModelTag.Local, ModelTag.BYOK, ModelTag.Experimental],
        provider: 'groq',
        title: 'llama 4 scout instruct',
    },
]

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
