import {
    AUTH_STATUS_FIXTURE_AUTHED,
    type AuthenticatedAuthStatus,
    type ClientConfiguration,
    type ClientConfigurationWithAccessToken,
    type CodyLLMSiteConfiguration,
    DOTCOM_URL,
    type GraphQLAPIClientConfig,
    graphqlClient,
} from '@sourcegraph/cody-shared'
import { beforeAll, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'
import { localStorage } from '../../services/LocalStorageProvider'
import { DEFAULT_VSCODE_SETTINGS } from '../../testutils/mocks'

import { createProvider } from './create-provider'

const getVSCodeConfigurationWithAccessToken = (
    config: Partial<ClientConfiguration> = {}
): ClientConfigurationWithAccessToken => ({
    ...DEFAULT_VSCODE_SETTINGS,
    ...config,
    serverEndpoint: 'https://example.com',
    accessToken: 'foobar',
})

const dummyAuthStatus: AuthenticatedAuthStatus = {
    ...AUTH_STATUS_FIXTURE_AUTHED,
    endpoint: DOTCOM_URL.toString(),
    configOverwrites: {
        provider: 'sourcegraph',
        completionModel: 'fireworks/starcoder-hybrid',
    },
}

graphqlClient.setConfig({} as unknown as GraphQLAPIClientConfig)

describe('createProvider', () => {
    beforeAll(async () => {
        localStorage.setStorage({
            get: () => null,
            update: () => Promise.resolve(undefined),
        } as any as vscode.Memento)
    })

    describe('if completions provider fields are defined in VSCode settings', () => {
        it('returns null if completions provider is not supported', async () => {
            const provider = await createProvider(
                getVSCodeConfigurationWithAccessToken({
                    autocompleteAdvancedProvider:
                        'nasa-ai' as ClientConfiguration['autocompleteAdvancedProvider'],
                }),
                AUTH_STATUS_FIXTURE_AUTHED
            )
            expect(provider).toBeNull()
        })
    })

    describe('if completions provider field is not defined in VSCode settings', () => {
        it('returns `null` if completions provider is not configured', async () => {
            const provider = await createProvider(
                getVSCodeConfigurationWithAccessToken({
                    autocompleteAdvancedProvider:
                        null as ClientConfiguration['autocompleteAdvancedProvider'],
                }),
                AUTH_STATUS_FIXTURE_AUTHED
            )
            expect(provider).toBeNull()
        })

        it('returns "fireworks" provider config and corresponding model if specified', async () => {
            const provider = await createProvider(
                getVSCodeConfigurationWithAccessToken({
                    autocompleteAdvancedProvider: 'fireworks',
                    autocompleteAdvancedModel: 'starcoder-7b',
                }),
                dummyAuthStatus
            )
            expect(provider?.id).toBe('fireworks')
            expect(provider?.legacyModel).toBe('starcoder-7b')
        })

        it('returns "fireworks" provider config if specified in settings and default model', async () => {
            const provider = await createProvider(
                getVSCodeConfigurationWithAccessToken({ autocompleteAdvancedProvider: 'fireworks' }),
                dummyAuthStatus
            )
            expect(provider?.id).toBe('fireworks')
            expect(provider?.legacyModel).toBe('deepseek-coder-v2-lite-base')
        })

        it('returns "experimental-openaicompatible" provider config and corresponding model if specified', async () => {
            const provider = await createProvider(
                getVSCodeConfigurationWithAccessToken({
                    autocompleteAdvancedProvider: 'experimental-openaicompatible',
                    autocompleteAdvancedModel: 'starchat-16b-beta',
                }),
                dummyAuthStatus
            )
            expect(provider?.id).toBe('experimental-openaicompatible')
            expect(provider?.legacyModel).toBe('starchat-16b-beta')
        })

        it('returns "experimental-openaicompatible" provider config if specified in settings and default model', async () => {
            const provider = await createProvider(
                getVSCodeConfigurationWithAccessToken({
                    autocompleteAdvancedProvider: 'experimental-openaicompatible',
                }),
                dummyAuthStatus
            )
            expect(provider?.id).toBe('experimental-openaicompatible')
            // TODO(slimsag): make this default to starchat2 once added
            // specifically just when using `experimental-openaicompatible`
            expect(provider?.legacyModel).toBe('starcoder-hybrid')
        })

        it('returns "unstable-openai" provider config if specified in VSCode settings; model is ignored', async () => {
            const provider = await createProvider(
                getVSCodeConfigurationWithAccessToken({
                    autocompleteAdvancedProvider: 'unstable-openai',
                    autocompleteAdvancedModel: 'hello-world',
                }),
                dummyAuthStatus
            )
            expect(provider?.id).toBe('unstable-openai')
            expect(provider?.legacyModel).toBe('gpt-35-turbo')
        })

        it('returns "anthropic" provider config if specified in VSCode settings', async () => {
            const provider = await createProvider(
                getVSCodeConfigurationWithAccessToken({
                    autocompleteAdvancedProvider: 'anthropic',
                }),
                dummyAuthStatus
            )
            expect(provider?.id).toBe('anthropic')
            expect(provider?.legacyModel).toBe('anthropic/claude-instant-1.2')
        })

        it('provider specified in VSCode settings takes precedence over the one defined in the site config', async () => {
            const provider = await createProvider(
                getVSCodeConfigurationWithAccessToken({
                    autocompleteAdvancedProvider: 'unstable-openai',
                }),
                {
                    ...dummyAuthStatus,
                    configOverwrites: {
                        provider: 'azure-open-ai',
                        completionModel: 'gpt-35-turbo-test',
                    },
                }
            )
            expect(provider?.id).toBe('unstable-openai')
            expect(provider?.legacyModel).toBe('gpt-35-turbo')
        })
    })

    describe('completions provider and model are defined in the site config and not set in VSCode settings', () => {
        describe('if provider is "sourcegraph"', () => {
            const testCases: {
                configOverwrites: CodyLLMSiteConfiguration
                expected: { provider: string; legacyModel?: string } | null
            }[] = [
                // sourcegraph
                {
                    configOverwrites: { provider: 'sourcegraph', completionModel: 'hello-world' },
                    expected: null,
                },
                {
                    configOverwrites: {
                        provider: 'sourcegraph',
                        completionModel: 'anthropic/claude-instant-1.2',
                    },
                    expected: { provider: 'anthropic', legacyModel: 'anthropic/claude-instant-1.2' },
                },
                {
                    configOverwrites: { provider: 'sourcegraph', completionModel: 'anthropic/' },
                    expected: null,
                },
                {
                    configOverwrites: {
                        provider: 'sourcegraph',
                        completionModel: '/claude-instant-1.2',
                    },
                    expected: null,
                },
                {
                    configOverwrites: {
                        provider: 'sourcegraph',
                        completionModel: 'fireworks/starcoder',
                    },
                    expected: { provider: 'fireworks', legacyModel: 'starcoder' },
                },

                // aws-bedrock
                {
                    configOverwrites: { provider: 'aws-bedrock', completionModel: 'hello-world' },
                    expected: null,
                },
                {
                    configOverwrites: {
                        provider: 'aws-bedrock',
                        completionModel: 'anthropic.claude-instant-1.2',
                    },
                    expected: { provider: 'anthropic', legacyModel: 'anthropic/claude-instant-1.2' },
                },
                {
                    configOverwrites: { provider: 'aws-bedrock', completionModel: 'anthropic.' },
                    expected: null,
                },
                {
                    configOverwrites: {
                        provider: 'aws-bedrock',
                        completionModel: 'anthropic/claude-instant-1.2',
                    },
                    expected: null,
                },

                // open-ai
                {
                    configOverwrites: { provider: 'openai', completionModel: 'gpt-35-turbo-test' },
                    expected: { provider: 'unstable-openai', legacyModel: 'gpt-35-turbo-test' },
                },
                {
                    configOverwrites: { provider: 'openai' },
                    expected: { provider: 'unstable-openai', legacyModel: 'gpt-35-turbo' },
                },

                // azure-openai
                {
                    configOverwrites: { provider: 'azure-openai', completionModel: 'gpt-35-turbo-test' },
                    expected: { provider: 'unstable-openai', legacyModel: '' },
                },
                {
                    configOverwrites: { provider: 'azure-openai' },
                    expected: { provider: 'unstable-openai', legacyModel: 'gpt-35-turbo' },
                },

                // fireworks
                {
                    configOverwrites: { provider: 'fireworks', completionModel: 'starcoder-7b' },
                    expected: { provider: 'fireworks', legacyModel: 'starcoder-7b' },
                },
                {
                    configOverwrites: { provider: 'fireworks' },
                    expected: { provider: 'fireworks', legacyModel: 'deepseek-coder-v2-lite-base' },
                },

                // unknown-provider
                {
                    configOverwrites: {
                        provider: 'unknown-provider',
                        completionModel: 'superdupercoder-7b',
                    },
                    expected: null,
                },

                // provider not defined (backward compat)
                {
                    configOverwrites: { provider: undefined, completionModel: 'superdupercoder-7b' },
                    expected: null,
                },
            ]

            for (const { configOverwrites, expected } of testCases) {
                it(`returns ${JSON.stringify(expected)} when cody LLM config is ${JSON.stringify(
                    configOverwrites
                )}`, async () => {
                    const provider = await createProvider(getVSCodeConfigurationWithAccessToken(), {
                        ...dummyAuthStatus,
                        configOverwrites,
                    })
                    if (expected === null) {
                        expect(provider).toBeNull()
                    } else {
                        expect(provider?.id).toBe(expected.provider)
                        expect(provider?.legacyModel).toBe(expected.legacyModel)
                    }
                })
            }
        })
    })
})
