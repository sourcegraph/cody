import { describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { DOTCOM_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'

import { getConfiguration } from './configuration'

describe('getConfiguration', () => {
    it('returns default values when no config set', () => {
        const config: Pick<vscode.WorkspaceConfiguration, 'get'> = {
            get: <T>(_key: string, defaultValue?: T): typeof defaultValue | undefined => defaultValue,
        }
        expect(getConfiguration(config)).toEqual({
            serverEndpoint: DOTCOM_URL.href,
            proxy: null,
            codebase: '',
            customHeaders: {},
            chatPreInstruction: undefined,
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
            autocompleteExperimentalSyntacticPostProcessing: true,
            autocompleteExperimentalGraphContext: false,
            autocompleteExperimentalOllamaOptions: { url: 'http://localhost:11434', model: 'codellama:7b-code' },
        })
    })

    it('reads values from config', () => {
        const config: Pick<vscode.WorkspaceConfiguration, 'get'> = {
            get: key => {
                switch (key) {
                    case 'cody.serverEndpoint':
                        return 'http://example.com'
                    case 'cody.proxy':
                        return 'socks5://127.0.0.1:9999'
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
                    case 'cody.experimental.chatPredictions':
                        return true
                    case 'cody.experimental.commandLenses':
                        return true
                    case 'cody.experimental.editorTitleCommandIcon':
                        return true
                    case 'cody.experimental.guardrails':
                        return true
                    case 'cody.inlineChat.enabled':
                        return true
                    case 'cody.codeActions.enabled':
                        return true
                    case 'cody.experimental.nonStop':
                        return true
                    case 'cody.experimental.localSymbols':
                        return true
                    case 'cody.experimental.symf.path':
                        return '/usr/local/bin/symf'
                    case 'cody.debug.enable':
                        return true
                    case 'cody.debug.verbose':
                        return true
                    case 'cody.debug.filter':
                        return /.*/
                    case 'cody.telemetry.level':
                        return 'off'
                    case 'cody.chat.preInstruction':
                        return 'My name is Jeff.'
                    case 'cody.autocomplete.advanced.provider':
                        return 'unstable-codegen'
                    case 'cody.autocomplete.advanced.serverEndpoint':
                        return 'https://example.com/llm'
                    case 'cody.autocomplete.advanced.model':
                        return 'starcoder-32b'
                    case 'cody.autocomplete.advanced.accessToken':
                        return 'foobar'
                    case 'cody.autocomplete.advanced.embeddings':
                        return false
                    case 'cody.autocomplete.experimental.completeSuggestWidgetSelection':
                        return false
                    case 'cody.autocomplete.experimental.syntacticPostProcessing':
                        return true
                    case 'cody.autocomplete.experimental.graphContext':
                        return true
                    case 'cody.advanced.agent.running':
                        return false
                    case 'cody.autocomplete.experimental.ollamaOptions':
                        return {}
                    default:
                        throw new Error(`unexpected key: ${key}`)
                }
            },
        }
        expect(getConfiguration(config)).toEqual({
            serverEndpoint: 'http://example.com',
            proxy: 'socks5://127.0.0.1:9999',
            codebase: 'my/codebase',
            useContext: 'keyword',
            customHeaders: {
                'Cache-Control': 'no-cache',
                'Proxy-Authenticate': 'Basic',
            },
            chatPreInstruction: 'My name is Jeff.',
            autocomplete: false,
            experimentalChatPredictions: true,
            experimentalCommandLenses: true,
            experimentalEditorTitleCommandIcon: true,
            experimentalGuardrails: true,
            experimentalLocalSymbols: true,
            inlineChat: true,
            codeActions: true,
            isRunningInsideAgent: false,
            experimentalNonStop: true,
            debugEnable: true,
            debugVerbose: true,
            debugFilter: /.*/,
            telemetryLevel: 'off',
            autocompleteAdvancedProvider: 'unstable-codegen',
            autocompleteAdvancedServerEndpoint: 'https://example.com/llm',
            autocompleteAdvancedModel: 'starcoder-32b',
            autocompleteAdvancedAccessToken: 'foobar',
            autocompleteExperimentalCompleteSuggestWidgetSelection: false,
            autocompleteExperimentalSyntacticPostProcessing: true,
            autocompleteExperimentalGraphContext: true,
            autocompleteExperimentalOllamaOptions: {},
        })
    })
})
