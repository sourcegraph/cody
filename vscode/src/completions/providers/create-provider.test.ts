import { describe, expect, it } from 'vitest'

import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import {
    CodyLLMSiteConfiguration,
    GraphQLAPIClientConfig,
    graphqlClient,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'

import { DEFAULT_VSCODE_SETTINGS } from '../../testutils/mocks'
import { CodeCompletionsClient } from '../client'

import { createProviderConfig } from './create-provider'

const getVSCodeSettings = (config: Partial<Configuration> = {}): Configuration => ({
    ...DEFAULT_VSCODE_SETTINGS,
    ...config,
})

const dummyCodeCompletionsClient: CodeCompletionsClient = {
    complete: () => Promise.resolve({ completion: '', stopReason: '' }),
    onConfigurationChange: () => undefined,
}

graphqlClient.onConfigurationChange({} as unknown as GraphQLAPIClientConfig)

describe('createProviderConfig', () => {
    describe('if completions provider fields are defined in VSCode settings', () => {
        it('returns null if completions provider is not supported', async () => {
            const provider = await createProviderConfig(
                getVSCodeSettings({
                    autocompleteAdvancedProvider: 'nasa-ai' as Configuration['autocompleteAdvancedProvider'],
                }),
                dummyCodeCompletionsClient,
                {}
            )
            expect(provider).toBeNull()
        })
    })

    describe('if completions provider field is not defined in VSCode settings', () => {
        it('returns "anthropic" if completions provider is not configured', async () => {
            const provider = await createProviderConfig(
                getVSCodeSettings({
                    autocompleteAdvancedProvider: null as Configuration['autocompleteAdvancedProvider'],
                }),
                dummyCodeCompletionsClient,
                {}
            )
            expect(provider?.identifier).toBe('anthropic')
            expect(provider?.model).toBe('claude-instant-1.2')
        })

        it('returns "fireworks" provider config and corresponding model if specified', async () => {
            const provider = await createProviderConfig(
                getVSCodeSettings({
                    autocompleteAdvancedProvider: 'fireworks',
                    autocompleteAdvancedModel: 'starcoder-3b',
                }),
                dummyCodeCompletionsClient,
                {}
            )
            expect(provider?.identifier).toBe('fireworks')
            expect(provider?.model).toBe('starcoder-3b')
        })

        it('returns "fireworks" provider config if specified in settings and default model', async () => {
            const provider = await createProviderConfig(
                getVSCodeSettings({ autocompleteAdvancedProvider: 'fireworks' }),
                dummyCodeCompletionsClient,
                {}
            )
            expect(provider?.identifier).toBe('fireworks')
            expect(provider?.model).toBe('starcoder-hybrid')
        })

        it('returns "openai" provider config if specified in VSCode settings; model is ignored', async () => {
            const provider = await createProviderConfig(
                getVSCodeSettings({
                    autocompleteAdvancedProvider: 'unstable-openai',
                    autocompleteAdvancedModel: 'hello-world',
                }),
                dummyCodeCompletionsClient,
                {}
            )
            expect(provider?.identifier).toBe('unstable-openai')
            expect(provider?.model).toBe('gpt-35-turbo')
        })

        it('returns "anthropic" provider config if specified in VSCode settings', async () => {
            const provider = await createProviderConfig(
                getVSCodeSettings({
                    autocompleteAdvancedProvider: 'anthropic',
                }),
                dummyCodeCompletionsClient,
                {}
            )
            expect(provider?.identifier).toBe('anthropic')
            expect(provider?.model).toBe('claude-instant-1.2')
        })

        it('provider specified in VSCode settings takes precedence over the one defined in the site config', async () => {
            const provider = await createProviderConfig(
                getVSCodeSettings({
                    autocompleteAdvancedProvider: 'unstable-openai',
                }),
                dummyCodeCompletionsClient,
                { provider: 'azure-open-ai', completionModel: 'gpt-35-turbo-test' }
            )
            expect(provider?.identifier).toBe('unstable-openai')
            expect(provider?.model).toBe('gpt-35-turbo')
        })
    })

    describe('completions provider and model are defined in the site config and not set in VSCode settings', () => {
        describe('if provider is "sourcegraph"', () => {
            const testCases: {
                codyLLMConfig: CodyLLMSiteConfiguration
                expected: { provider: string; model?: string } | null
            }[] = [
                // sourcegraph
                { codyLLMConfig: { provider: 'sourcegraph', completionModel: 'hello-world' }, expected: null },
                {
                    codyLLMConfig: { provider: 'sourcegraph', completionModel: 'anthropic/claude-instant-1.2' },
                    expected: { provider: 'anthropic', model: 'claude-instant-1.2' },
                },
                {
                    codyLLMConfig: { provider: 'sourcegraph', completionModel: 'anthropic/' },
                    expected: null,
                },
                {
                    codyLLMConfig: { provider: 'sourcegraph', completionModel: '/claude-instant-1.2' },
                    expected: null,
                },

                // aws-bedrock
                { codyLLMConfig: { provider: 'aws-bedrock', completionModel: 'hello-world' }, expected: null },
                {
                    codyLLMConfig: { provider: 'aws-bedrock', completionModel: 'anthropic.claude-instant-1.2' },
                    expected: { provider: 'anthropic', model: 'claude-instant-1.2' },
                },
                {
                    codyLLMConfig: { provider: 'aws-bedrock', completionModel: 'anthropic.' },
                    expected: null,
                },
                {
                    codyLLMConfig: { provider: 'aws-bedrock', completionModel: 'anthropic/claude-instant-1.2' },
                    expected: null,
                },

                // open-ai
                {
                    codyLLMConfig: { provider: 'openai', completionModel: 'gpt-35-turbo-test' },
                    expected: { provider: 'unstable-openai', model: 'gpt-35-turbo-test' },
                },
                {
                    codyLLMConfig: { provider: 'openai' },
                    expected: { provider: 'unstable-openai', model: 'gpt-35-turbo' },
                },

                // azure-openai
                {
                    codyLLMConfig: { provider: 'azure-openai', completionModel: 'gpt-35-turbo-test' },
                    expected: { provider: 'unstable-openai', model: '' },
                },
                {
                    codyLLMConfig: { provider: 'azure-openai' },
                    expected: { provider: 'unstable-openai', model: 'gpt-35-turbo' },
                },

                // fireworks
                {
                    codyLLMConfig: { provider: 'fireworks', completionModel: 'llama-code-7b' },
                    expected: { provider: 'fireworks', model: 'llama-code-7b' },
                },
                {
                    codyLLMConfig: { provider: 'fireworks' },
                    expected: { provider: 'fireworks', model: 'starcoder-hybrid' },
                },

                // unknown-provider
                {
                    codyLLMConfig: { provider: 'unknown-provider', completionModel: 'llama-code-7b' },
                    expected: null,
                },

                // provider not defined (backward compat)
                {
                    codyLLMConfig: { provider: undefined, completionModel: 'llama-code-7b' },
                    expected: { provider: 'anthropic', model: 'claude-instant-1.2' },
                },
            ]

            for (const { codyLLMConfig, expected } of testCases) {
                it(`returns ${JSON.stringify(expected)} when cody LLM config is ${JSON.stringify(
                    codyLLMConfig
                )}`, async () => {
                    const provider = await createProviderConfig(
                        getVSCodeSettings(),
                        dummyCodeCompletionsClient,
                        codyLLMConfig
                    )
                    if (expected === null) {
                        expect(provider).toBeNull()
                    } else {
                        expect(provider?.identifier).toBe(expected.provider)
                        expect(provider?.model).toBe(expected.model)
                    }
                })
            }
        })
    })

    it('returns anthropic provider config if no completions provider specified in VSCode settings or site config', async () => {
        const provider = await createProviderConfig(getVSCodeSettings(), dummyCodeCompletionsClient, {})
        expect(provider?.identifier).toBe('anthropic')
        expect(provider?.model).toBe('claude-instant-1.2')
    })
})
