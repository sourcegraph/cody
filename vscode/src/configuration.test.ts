import { assert, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import {
    type ClientConfiguration,
    CodyAutoSuggestionMode,
    OLLAMA_DEFAULT_URL,
    ps,
} from '@sourcegraph/cody-shared'

import type { ChatModelProviderConfig } from '@sourcegraph/cody-shared/src/models/sync'
import { getConfiguration } from './configuration'
import { DEFAULT_VSCODE_SETTINGS } from './testutils/mocks'

describe('getConfiguration', () => {
    it('returns default values when no config set', () => {
        const config: Pick<vscode.WorkspaceConfiguration, 'get'> = {
            get: <T>(_key: string, defaultValue?: T): typeof defaultValue | undefined => defaultValue,
        }
        expect(getConfiguration(config)).toEqual(DEFAULT_VSCODE_SETTINGS)
    })

    it('reads values from config', () => {
        const config: Pick<vscode.WorkspaceConfiguration, 'get'> = {
            get: key => {
                switch (key) {
                    case 'cody.serverEndpoint':
                        return 'http://example.com'
                    case 'cody.codebase':
                        return 'my/codebase'
                    case 'cody.customHeaders':
                        return {
                            'Cache-Control': 'no-cache',
                            'Proxy-Authenticate': 'Basic',
                        }
                    case 'cody.suggestions.mode':
                        return CodyAutoSuggestionMode.Off
                    case 'cody.autocomplete.languages':
                        return { '*': true }
                    case 'cody.commandCodeLenses':
                        return true
                    case 'cody.codeActions.enabled':
                        return true
                    case 'cody.commandHints.enabled':
                        return true
                    case 'cody.experimental.tracing':
                        return true
                    case 'cody.experimental.commitMessage':
                        return true
                    case 'cody.debug.verbose':
                        return true
                    case 'cody.debug.filter':
                        return /.*/
                    case 'cody.telemetry.level':
                        return 'off'
                    case 'cody.telemetry.clientName':
                        return undefined
                    case 'cody.chat.preInstruction':
                        return 'My name is Jeff.'
                    case 'cody.edit.preInstruction':
                        return 'My name is not Jeff.'
                    case 'cody.autocomplete.advanced.provider':
                        return 'default'
                    case 'cody.autocomplete.advanced.model':
                        return 'starcoder-16b'
                    case 'cody.autocomplete.advanced.timeout.multiline':
                        return undefined
                    case 'cody.autocomplete.advanced.timeout.singleline':
                        return undefined
                    case 'cody.autocomplete.completeSuggestWidgetSelection':
                        return false
                    case 'cody.autocomplete.formatOnAccept':
                        return true
                    case 'cody.autocomplete.disableInsideComments':
                        return false
                    case 'cody.autocomplete.experimental.fireworksOptions':
                        return undefined
                    case 'cody.autocomplete.experimental.ollamaOptions':
                        return {
                            model: 'codellama:7b-code',
                            url: OLLAMA_DEFAULT_URL,
                        }
                    case 'cody.autocomplete.experimental.graphContext':
                        return 'lsp-light'
                    case 'cody.advanced.agent.running':
                        return false
                    case 'cody.advanced.hasNativeWebview':
                        return true
                    case 'cody.advanced.agent.ide.name':
                        return undefined
                    case 'cody.advanced.agent.ide.version':
                        return undefined
                    case 'cody.advanced.agent.extension.version':
                        return undefined
                    case 'cody.internal.unstable':
                        return false
                    case 'cody.internal.debug.context':
                        return false
                    case 'cody.internal.debug.state':
                        return false
                    case 'cody.experimental.supercompletions':
                        return false
                    case 'cody.experimental.autoedit-renderer-testing':
                        return false
                    case 'cody.experimental.autoedit.config.override':
                        return undefined
                    case 'cody.experimental.noodle':
                        return false
                    case 'cody.experimental.minion.anthropicKey':
                        return undefined
                    case 'cody.autocomplete.advanced.timeout.firstCompletion':
                        return 1500
                    case 'cody.experimental.guardrailsTimeoutSeconds':
                        return undefined
                    case 'cody.experimental.noxide.enabled':
                        return true
                    case 'cody.advanced.agent.capabilities.storage':
                        return false
                    case 'cody.provider.limit.prompt':
                        return 123
                    case 'cody.dev.models':
                        return [{ model: 'm', provider: 'p' }] satisfies ChatModelProviderConfig[]
                    case 'cody.net.mode':
                        return 'auto'
                    case 'cody.net.proxy.endpoint':
                        return 'https://localhost:8080'
                    case 'cody.net.proxy.cacert':
                        return '~/cody-proxy.pem'
                    case 'cody.net.proxy.skipCertValidation':
                        return false
                    case 'cody.override.authToken':
                        return undefined
                    case 'cody.override.serverEndpoint':
                        return undefined
                    case 'http':
                        return undefined
                    case 'cody.agentic.context.experimentalShell':
                        return false
                    case 'cody.agentic.context.experimentalOptions':
                        return { shell: { allow: ['git'] } }
                    case 'cody.auth.externalProviders':
                        return []
                    case 'cody.rules.enabled':
                    case 'cody.experimental.imageUpload':
                        return false
                    default:
                        assert(false, `unexpected key: ${key}`)
                }
            },
        }
        expect(getConfiguration(config)).toEqual({
            net: {
                mode: 'auto',
                proxy: {
                    cacert: '~/cody-proxy.pem',
                    endpoint: 'https://localhost:8080',
                    skipCertValidation: false,
                },
                vscode: undefined,
            },
            codebase: 'my/codebase',
            serverEndpoint: 'http://example.com',
            customHeaders: {
                'Cache-Control': 'no-cache',
                'Proxy-Authenticate': 'Basic',
            },
            chatPreInstruction: ps`My name is Jeff.`,
            editPreInstruction: ps`My name is not Jeff.`,
            autocomplete: false,
            autocompleteLanguages: {
                '*': true,
            },
            commandCodeLenses: true,
            agenticContextExperimentalOptions: { shell: { allow: ['git'] } },
            experimentalSupercompletions: false,
            experimentalAutoEditEnabled: false,
            experimentalAutoEditConfigOverride: undefined,
            experimentalAutoEditRendererTesting: false,
            experimentalMinionAnthropicKey: undefined,
            experimentalTracing: true,
            experimentalCommitMessage: true,
            experimentalNoodle: false,
            experimentalNoxideEnabled: true,
            codeActions: true,
            commandHints: true,
            isRunningInsideAgent: false,
            agentIDE: undefined,
            hasNativeWebview: true,
            internalUnstable: false,
            internalDebugContext: false,
            internalDebugState: false,
            debugVerbose: true,
            debugFilter: /.*/,
            telemetryLevel: 'off',
            agentHasPersistentStorage: false,
            autocompleteAdvancedProvider: 'default',
            autocompleteAdvancedModel: 'starcoder-16b',
            autocompleteCompleteSuggestWidgetSelection: false,
            autocompleteFormatOnAccept: true,
            autocompleteDisableInsideComments: false,
            autocompleteExperimentalFireworksOptions: undefined,
            autocompleteExperimentalGraphContext: 'lsp-light',
            autocompleteExperimentalOllamaOptions: {
                model: 'codellama:7b-code',
                url: OLLAMA_DEFAULT_URL,
            },
            autocompleteFirstCompletionTimeout: 1500,
            providerLimitPrompt: 123,
            devModels: [{ model: 'm', provider: 'p' }],
            experimentalGuardrailsTimeoutSeconds: undefined,

            overrideAuthToken: undefined,
            overrideServerEndpoint: undefined,
            authExternalProviders: [],
            rulesEnabled: false,
            experimentalImageUpload: false,
        } satisfies ClientConfiguration)
    })
})
