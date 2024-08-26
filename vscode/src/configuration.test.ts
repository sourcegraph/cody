import { describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { type ClientConfiguration, OLLAMA_DEFAULT_URL, ps } from '@sourcegraph/cody-shared'

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
                        return 'unstable-openai'
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
                    case 'cody.autocomplete.experimental.multiModelCompletions':
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
                    case 'cody.autocomplete.experimental.hotStreakAndSmartThrottle':
                        return false
                    case 'cody.experimental.guardrailsTimeoutSeconds':
                        return undefined
                    default:
                        throw new Error(`unexpected key: ${key}`)
                }
            },
        }
        expect(getConfiguration(config)).toEqual({
            proxy: undefined,
            codebase: 'my/codebase',
            useContext: 'keyword',
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
            internalUnstable: false,
            internalDebugContext: false,
            debugVerbose: true,
            debugFilter: /.*/,
            telemetryLevel: 'off',
            autocompleteAdvancedProvider: 'unstable-openai',
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
            autocompleteTimeouts: {
                multiline: undefined,
                singleline: undefined,
            },
            autocompleteFirstCompletionTimeout: 1500,
            autocompleteExperimentalPreloadDebounceInterval: 0,
            autocompleteExperimentalHotStreakAndSmartThrottle: false,
            testingModelConfig: undefined,
            experimentalGuardrailsTimeoutSeconds: undefined,
        } satisfies ClientConfiguration)
    })
})
