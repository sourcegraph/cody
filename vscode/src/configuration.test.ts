import { describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { type ClientConfiguration, OLLAMA_DEFAULT_URL, ps } from '@sourcegraph/cody-shared'

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
                    case 'cody.useContext':
                        return 'keyword'
                    case 'cody.customHeaders':
                        return {
                            'Cache-Control': 'no-cache',
                            'Proxy-Authenticate': 'Basic',
                        }
                    case 'cody.autocomplete.enabled':
                        return false
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
                        return 'bfg'
                    case 'cody.advanced.agent.running':
                        return false
                    case 'cody.advanced.hasNativeWebview':
                        return true
                    case 'cody.advanced.agent.ide':
                        return undefined
                    case 'cody.advanced.agent.ide.version':
                        return undefined
                    case 'cody.advanced.agent.extension.version':
                        return undefined
                    case 'cody.internal.unstable':
                        return false
                    case 'cody.internal.debug.context':
                        return false
                    case 'cody.experimental.supercompletions':
                        return false
                    case 'cody.experimental.noodle':
                        return false
                    case 'cody.experimental.minion.anthropicKey':
                        return undefined
                    case 'cody.autocomplete.advanced.timeout.firstCompletion':
                        return 1500
                    case 'cody.autocomplete.experimental.preloadDebounceInterval':
                        return 0
                    case 'cody.experimental.guardrailsTimeoutSeconds':
                        return undefined
                    case 'cody.advanced.agent.capabilities.storage':
                        return false
                    case 'cody.provider.limit.prompt':
                        return 123
                    case 'cody.dev.models':
                        return [{ model: 'm', provider: 'p' }] satisfies ChatModelProviderConfig[]
                    default:
                        throw new Error(`unexpected key: ${key}`)
                }
            },
        }
        expect(getConfiguration(config)).toEqual({
            proxy: undefined,
            codebase: 'my/codebase',
            useContext: 'keyword',
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
            experimentalSupercompletions: false,
            experimentalMinionAnthropicKey: undefined,
            experimentalTracing: true,
            experimentalCommitMessage: true,
            experimentalNoodle: false,
            codeActions: true,
            commandHints: true,
            isRunningInsideAgent: false,
            agentIDE: undefined,
            hasNativeWebview: true,
            internalUnstable: false,
            internalDebugContext: false,
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
            autocompleteExperimentalGraphContext: 'bfg',
            autocompleteExperimentalOllamaOptions: {
                model: 'codellama:7b-code',
                url: OLLAMA_DEFAULT_URL,
            },
            autocompleteFirstCompletionTimeout: 1500,
            autocompleteExperimentalPreloadDebounceInterval: 0,
            providerLimitPrompt: 123,
            devModels: [{ model: 'm', provider: 'p' }],
            testingModelConfig: undefined,
            experimentalGuardrailsTimeoutSeconds: undefined,
        } satisfies ClientConfiguration)
    })
})
