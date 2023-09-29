import { describe, expect, it } from 'vitest'

import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { DOTCOM_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { CodyLLMSiteConfiguration } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'

import { CodeCompletionsClient } from '../client'

import { createProviderConfig } from './createProvider'

const DEFAULT_VSCODE_SETTINGS: Configuration = {
    serverEndpoint: DOTCOM_URL.href,
    proxy: null,
    codebase: '',
    customHeaders: {},
    chatPreInstruction: 'My name is John Doe.',
    useContext: 'embeddings',
    autocomplete: true,
    experimentalCommandLenses: false,
    experimentalEditorTitleCommandIcon: false,
    experimentalChatPredictions: false,
    experimentalGuardrails: false,
    experimentalLocalSymbols: false,
    inlineChat: true,
    codeActions: true,
    isRunningInsideAgent: false,
    experimentalNonStop: false,
    debugEnable: false,
    debugVerbose: false,
    debugFilter: null,
    telemetryLevel: 'all',
    autocompleteAdvancedProvider: null,
    autocompleteAdvancedServerEndpoint: null,
    autocompleteAdvancedModel: null,
    autocompleteAdvancedAccessToken: null,
    autocompleteExperimentalCompleteSuggestWidgetSelection: false,
    autocompleteExperimentalSyntacticPostProcessing: false,
    autocompleteExperimentalGraphContext: false,
}

const getVSCodeSettings = (config: Partial<Configuration> = {}): Configuration => ({
    ...DEFAULT_VSCODE_SETTINGS,
    ...config,
})

const dummyCodeCompletionsClient: CodeCompletionsClient = {
    complete: () => Promise.resolve({ completion: '', stopReason: '' }),
    onConfigurationChange: () => undefined,
}

describe('createProviderConfig', () => {
    describe('if completions provider fields are defined in VSCode settings', () => {
        it('returns null if completions provider is not supported', async () => {
            const provider = await createProviderConfig(
                getVSCodeSettings({
                    autocompleteAdvancedProvider: 'nasa-ai' as Configuration['autocompleteAdvancedProvider'],
                }),
                dummyCodeCompletionsClient,
                undefined,
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
                undefined,
                {}
            )
            expect(provider?.identifier).toBe('anthropic')
            expect(provider?.model).toBe('claude-instant-infill')
        })

        it('returns "codegen" provider config if the corresponding provider name and endpoint are specified', async () => {
            const provider = await createProviderConfig(
                getVSCodeSettings({
                    autocompleteAdvancedProvider: 'unstable-codegen',
                    autocompleteAdvancedServerEndpoint: 'https://unstable-codegen.com',
                }),
                dummyCodeCompletionsClient,
                undefined,
                {}
            )
            expect(provider?.identifier).toBe('codegen')
            expect(provider?.model).toBe('codegen')
        })

        it('returns null if provider is "unstable-codegen", but the server endpoint is not set', async () => {
            const provider = await createProviderConfig(
                getVSCodeSettings({ autocompleteAdvancedProvider: 'unstable-codegen' }),
                dummyCodeCompletionsClient,
                undefined,
                {}
            )
            expect(provider).toBeNull()
        })

        it('returns "fireworks" provider config and corresponding model if specified', async () => {
            const provider = await createProviderConfig(
                getVSCodeSettings({
                    autocompleteAdvancedProvider: 'unstable-fireworks',
                    autocompleteAdvancedModel: 'starcoder-3b',
                }),
                dummyCodeCompletionsClient,
                undefined,
                {}
            )
            expect(provider?.identifier).toBe('fireworks')
            expect(provider?.model).toBe('starcoder-3b')
        })

        it('returns "fireworks" provider config if specified in settings and default model', async () => {
            const provider = await createProviderConfig(
                getVSCodeSettings({ autocompleteAdvancedProvider: 'unstable-fireworks' }),
                dummyCodeCompletionsClient,
                undefined,
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
                undefined,
                {}
            )
            expect(provider?.identifier).toBe('unstable-openai')
            expect(provider?.model).toBe('gpt-35-turbo')
        })

        it('returns "anthropic" provider config if specified in VSCode settings; model is ignored', async () => {
            const provider = await createProviderConfig(
                getVSCodeSettings({
                    autocompleteAdvancedProvider: 'anthropic',
                    autocompleteAdvancedModel: 'hello-world',
                }),
                dummyCodeCompletionsClient,
                undefined,
                {}
            )
            expect(provider?.identifier).toBe('anthropic')
            expect(provider?.model).toBe('claude-instant-infill')
        })

        it('provider specified in VSCode settings takes precedence over the one defined in the site config', async () => {
            const provider = await createProviderConfig(
                getVSCodeSettings({
                    autocompleteAdvancedProvider: 'unstable-codegen',
                    autocompleteAdvancedServerEndpoint: 'https://unstable-codegen.com',
                }),
                dummyCodeCompletionsClient,
                undefined,
                { provider: 'azure-open-ai', completionModel: 'gpt-35-turbo-test' }
            )
            expect(provider?.identifier).toBe('codegen')
            expect(provider?.model).toBe('codegen')
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
                    codyLLMConfig: { provider: 'sourcegraph', completionModel: 'anthropic/claude-instant-infill' },
                    expected: { provider: 'anthropic', model: 'claude-instant-infill' },
                },
                {
                    codyLLMConfig: { provider: 'sourcegraph', completionModel: 'anthropic/' },
                    expected: null,
                },
                {
                    codyLLMConfig: { provider: 'sourcegraph', completionModel: '/claude-instant-infill' },
                    expected: null,
                },

                // aws-bedrock
                { codyLLMConfig: { provider: 'aws-bedrock', completionModel: 'hello-world' }, expected: null },
                {
                    codyLLMConfig: { provider: 'aws-bedrock', completionModel: 'anthropic.claude-instant-infill' },
                    expected: { provider: 'anthropic', model: 'claude-instant-infill' },
                },
                {
                    codyLLMConfig: { provider: 'aws-bedrock', completionModel: 'anthropic.' },
                    expected: null,
                },
                {
                    codyLLMConfig: { provider: 'aws-bedrock', completionModel: 'anthropic/claude-instant-infill' },
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
                    expected: { provider: 'anthropic', model: 'claude-instant-infill' },
                },
            ]

            for (const { codyLLMConfig, expected } of testCases) {
                it(`returns ${JSON.stringify(expected)} when cody LLM config is ${JSON.stringify(
                    codyLLMConfig
                )}`, async () => {
                    const provider = await createProviderConfig(
                        getVSCodeSettings(),
                        dummyCodeCompletionsClient,
                        undefined,
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
        const provider = await createProviderConfig(getVSCodeSettings(), dummyCodeCompletionsClient, undefined, {})
        expect(provider?.identifier).toBe('anthropic')
        expect(provider?.model).toBe('claude-instant-infill')
    })
})
