import type { ModelCategory, ModelTier, ServerModelConfiguration } from '@sourcegraph/cody-shared'

export const SERVER_MODELS: ServerModelConfiguration = {
    schemaVersion: '1.0',
    revision: '-',
    providers: [],
    models: [
        {
            modelRef: 'anthropic::unknown::anthropic.claude-3-opus-20240229-v1_0',
            displayName: 'Opus',
            modelName: 'anthropic.claude-3-opus-20240229-v1_0',
            capabilities: ['autocomplete', 'chat'],
            category: 'balanced' as ModelCategory,
            status: 'stable',
            tier: 'enterprise' as ModelTier,
            contextWindow: {
                maxInputTokens: 9000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'anthropic::unknown::anthropic.claude-instant-v1',
            displayName: 'Instant',
            modelName: 'anthropic.claude-instant-v1',
            capabilities: ['autocomplete', 'chat'],
            category: 'balanced' as ModelCategory,
            status: 'stable',
            tier: 'enterprise' as ModelTier,
            contextWindow: {
                maxInputTokens: 9000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'anthropic::unknown::amazon.titan-text-lite-v1',
            displayName: 'Titan',
            modelName: 'amazon.titan-text-lite-v1',
            capabilities: ['autocomplete', 'chat'],
            category: 'balanced' as ModelCategory,
            status: 'stable',
            tier: 'enterprise' as ModelTier,
            contextWindow: {
                maxInputTokens: 9000,
                maxOutputTokens: 4000,
            },
        },
    ],
    defaultModels: {
        chat: 'anthropic::unknown::anthropic.claude-3-opus-20240229-v1_0',
        fastChat: 'anthropic::unknown::amazon.titan-text-lite-v1',
        codeCompletion: 'anthropic::unknown::anthropic.claude-instant-v1',
    },
}
