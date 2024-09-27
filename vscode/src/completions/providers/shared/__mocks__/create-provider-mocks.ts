
import { ModelTag, ServerModelConfiguration } from '@sourcegraph/cody-shared'

/**
 * Created by copy-pasting the sg02 model configuration API response.
 *
 * Ideally, we want this to be generated by the server-side and distributed as an npm package
 * similar to context-filters-config. But this is a good start compared to not having any client
 * tests for this type of configuration.
 */
export function getServerSentModelsMock(): ServerModelConfiguration {
    return { ...serverSentModelsMock}
}

export type ServerSentModelsMock = typeof serverSentModelsMock

const serverSentModelsMock = {
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
            id: 'unstable-openai',
            displayName: 'Unstable OpenAI',
        },
        {
            id: 'mistral',
            displayName: 'Mistral',
        },
        {
            id: 'groq',
            displayName: 'Groq',
        },
        {
            id: 'cerebras',
            displayName: 'cerebras',
        },
        {
            id: 'azure-openai',
            displayName: 'Azure OpenAI',
        },
        {
            id: 'aws-bedrock',
            displayName: 'AWS Bedrock',
        },
        {
            id: 'google-anthropic',
            displayName: 'Google Anthropic',
        },
    ],
    models: [
        {
            modelRef: 'anthropic::2023-06-01::claude-3-sonnet',
            displayName: 'Claude 3 Sonnet',
            modelName: 'claude-3-sonnet-20240229',
            capabilities: ['autocomplete', 'chat'],
            category: 'balanced' as ModelTag.Balanced,
            status: 'stable',
            tier: 'free' as ModelTag.Free,
            contextWindow: {
                maxInputTokens: 30000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'anthropic::2023-06-01::claude-3.5-sonnet',
            displayName: 'Claude 3.5 Sonnet',
            modelName: 'claude-3-5-sonnet-20240620',
            capabilities: ['autocomplete', 'chat'],
            category: 'power' as ModelTag.Balanced,
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 30000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'anthropic::2023-06-01::claude-3-opus',
            displayName: 'Claude 3 Opus',
            modelName: 'claude-3-opus-20240229',
            capabilities: ['autocomplete', 'chat'],
            category: 'power' as ModelTag.Balanced,
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 30000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'anthropic::2023-06-01::claude-3-haiku-20240307',
            displayName: 'Claude 3 Haiku',
            modelName: 'claude-3-haiku-20240307',
            capabilities: ['autocomplete', 'chat'],
            category: 'speed' as ModelTag.Balanced,
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
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
            category: 'speed' as ModelTag.Balanced,
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
            category: 'speed' as ModelTag.Balanced,
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 2048,
                maxOutputTokens: 256,
            },
        },
        {
            modelRef: 'google::v1::gemini-1.5-pro-latest',
            displayName: 'Gemini 1.5 Pro',
            modelName: 'gemini-1.5-pro-latest',
            capabilities: ['autocomplete', 'chat'],
            category: 'power' as ModelTag.Balanced,
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 30000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'google::v1::gemini-1.5-flash-latest',
            displayName: 'Gemini 1.5 Flash',
            modelName: 'gemini-1.5-flash-latest',
            capabilities: ['autocomplete', 'chat'],
            category: 'speed' as ModelTag.Balanced,
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 30000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'mistral::v1::mixtral-8x7b-instruct',
            displayName: 'Mixtral 8x7B',
            modelName: 'accounts/fireworks/models/mixtral-8x7b-instruct',
            capabilities: ['autocomplete', 'chat'],
            category: 'speed' as ModelTag.Balanced,
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 7000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'mistral::v1::mixtral-8x22b-instruct',
            displayName: 'Mixtral 8x22B',
            modelName: 'accounts/fireworks/models/mixtral-8x22b-instruct',
            capabilities: ['autocomplete', 'chat'],
            category: 'power' as ModelTag.Balanced,
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 7000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'openai::2024-02-01::gpt-4o',
            displayName: 'GPT-4o',
            modelName: 'gpt-4o',
            capabilities: ['autocomplete', 'chat'],
            category: 'power' as ModelTag.Balanced,
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 30000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'unstable-openai::2024-02-01::gpt-4o',
            displayName: 'unstable GPT-4o',
            modelName: 'gpt-4o',
            capabilities: ['autocomplete', 'chat'],
            category: 'power' as ModelTag.Balanced,
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 30000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'experimental-openaicompatible::2024-02-01::starchat-16b-beta',
            displayName: 'starchat 16b',
            modelName: 'starchat-16b',
            capabilities: ['autocomplete', 'chat'],
            category: 'power' as ModelTag.Balanced,
            status: 'stable',
            tier: 'pro' as ModelTag.Pro,
            contextWindow: {
                maxInputTokens: 30000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'cerebras::v1::llama3.1-70b',
            displayName: 'Llama 3.1 70b (via Cerebras)',
            modelName: 'llama3.1-70b',
            capabilities: ['chat', 'autocomplete'],
            category: 'balanced' as ModelTag.Balanced,
            status: 'stable',
            tier: 'enterprise' as ModelTag.Enterprise,
            contextWindow: {
                maxInputTokens: 8192,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'groq::v1::llama-3.1-70b-versatile',
            displayName: 'Llama-3.1 70b (via Groq)',
            modelName: 'llama-3.1-70b-versatile',
            capabilities: ['chat', 'autocomplete'],
            category: 'balanced' as ModelTag.Balanced,
            status: 'stable',
            tier: 'enterprise' as ModelTag.Enterprise,
            contextWindow: {
                maxInputTokens: 8192,
                maxOutputTokens: 4096,
            },
            clientSideConfig: {
                openAICompatible: {},
            },
        },
        {
            modelRef: 'openai::v1::gpt-4o-rrr-n',
            displayName: 'New model',
            modelName: 'gpt-4o-rrr-n',
            capabilities: ['chat'],
            category: 'power' as ModelTag.Balanced,
            status: 'stable',
            tier: 'enterprise' as ModelTag.Enterprise,
            contextWindow: {
                maxInputTokens: 8192,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'azure-openai::v1::gpt-4o-test',
            displayName: 'GPT-4o (via Azure OpenAI)',
            modelName: 'gpt-4o-test',
            capabilities: ['chat'],
            category: 'power' as ModelTag.Balanced,
            status: 'stable',
            tier: 'enterprise' as ModelTag.Enterprise,
            contextWindow: {
                maxInputTokens: 8192,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'azure-openai::v1::gpt-4o-mini-test',
            displayName: 'Mini (via Azure OpenAI)',
            modelName: 'gpt-4o-mini-test',
            capabilities: ['chat', 'autocomplete'],
            category: 'power' as ModelTag.Balanced,
            status: 'stable',
            tier: 'free' as ModelTag.Free,
            contextWindow: {
                maxInputTokens: 8192,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'aws-bedrock::v1::claude-3-opus-20240229-v1',
            displayName: 'Claude Opus (via AWS Bedrock)',
            modelName: 'anthropic.claude-3-opus-20240229-v1:0',
            capabilities: ['chat'],
            category: 'power' as ModelTag.Balanced,
            status: 'stable',
            tier: 'enterprise' as ModelTag.Enterprise,
            contextWindow: {
                maxInputTokens: 8192,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'google-anthropic::unknown::claude-sonnet-google-anthropic',
            displayName: 'Claude 3.5 Sonnet (via Google/Vertex)',
            modelName: 'claude-3-5-sonnet@20240620',
            capabilities: ['chat'],
            category: 'power' as ModelTag.Balanced,
            status: 'stable',
            tier: 'enterprise' as ModelTag.Enterprise,
            contextWindow: {
                maxInputTokens: 8192,
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
