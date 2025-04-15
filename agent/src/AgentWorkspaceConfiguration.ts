import _ from 'lodash'
import type * as vscode from 'vscode'

import { type ClientConfiguration, CodyIDE } from '@sourcegraph/cody-shared'

import { defaultConfigurationValue } from '../../vscode/src/configuration-keys'

import type { AgentEventEmitter } from '../../vscode/src/testutils/AgentEventEmitter'
import type { ClientInfo, ExtensionConfiguration } from './protocol-alias'

export class AgentWorkspaceConfiguration implements vscode.WorkspaceConfiguration {
    constructor(
        private prefix: string[],
        private clientInfo: () => ClientInfo | undefined,
        private extensionConfig: () => ExtensionConfiguration | undefined,
        private onDidChange: AgentEventEmitter<vscode.ConfigurationChangeEvent> | undefined = undefined,
        private dictionary: any = {}
    ) {}

    public withPrefix(prefix: string): AgentWorkspaceConfiguration {
        return new AgentWorkspaceConfiguration(
            this.prefix.concat(prefix),
            this.clientInfo,
            this.extensionConfig,
            this.onDidChange,
            this.dictionary
        )
    }

    private put(key: string, value: any): void {
        _.set(this.dictionary, key, value)
    }

    private actualSection(section: string): string {
        if (this.prefix.length === 0) {
            return section
        }
        return [...this.prefix, section].join('.')
    }

    public static clientNameToIDE(value: string): ClientConfiguration['agentIDE'] | undefined {
        switch (value.toLowerCase()) {
            case 'vscode':
                return CodyIDE.VSCode
            case 'jetbrains':
                return CodyIDE.JetBrains
            case 'emacs':
                return CodyIDE.Emacs
            case 'neovim':
                return CodyIDE.Neovim
            case 'web':
                return CodyIDE.Web
            case 'visualstudio':
                return CodyIDE.VisualStudio
            case 'eclipse':
                return CodyIDE.Eclipse
            case 'standalone-web':
                return CodyIDE.StandaloneWeb
            default:
                return undefined
        }
    }

    public get(userSection: string, defaultValue?: unknown): any {
        const section = this.actualSection(userSection)

        const config = this.extensionConfig()
        const capabilities = this.clientInfo()?.capabilities
        const baseConfig = {
            editor: {
                insertSpaces: true,
            },
            search: {
                useIgnoreFiles: true,
            },
            cody: {
                advanced: {
                    agent: {
                        capabilities: {
                            storage:
                                capabilities?.globalState === 'server-managed' ||
                                capabilities?.globalState === 'client-managed',
                        },
                        extension: {
                            version: this.clientInfo()?.version,
                        },
                        ide: {
                            name: AgentWorkspaceConfiguration.clientNameToIDE(
                                this.clientInfo()?.name ?? ''
                            ),
                            version: this.clientInfo()?.ideVersion,
                        },
                        running: true,
                    },
                    hasNativeWebview: capabilities?.webview === 'native',
                },
                autocomplete: {
                    advanced: {
                        model: config?.autocompleteAdvancedModel ?? null,
                        provider: config?.autocompleteAdvancedProvider ?? null,
                    },
                    // If suggestionsMode is set, honor that, otherwise default to true
                    enabled: config?.suggestionsMode ? config.suggestionsMode === 'autocomplete' : true,
                },
                suggestions: {
                    mode: config?.suggestionsMode || 'autocomplete',
                },
                codebase: config?.codebase,
                customHeaders: config?.customHeaders,
                debug: { verbose: config?.verboseDebug ?? false },
                experimental: { tracing: config?.verboseDebug ?? false },
                serverEndpoint: config?.serverEndpoint,
                // Use the dedicated `telemetry/recordEvent` to send telemetry from
                // agent clients.  The reason we disable telemetry via config is
                // that we don't want to submit vscode-specific events when
                // running inside the agent.
                telemetry: {
                    clientName: config?.telemetryClientName,
                    level: 'agent',
                },
            },
        }

        function mergeWithBaseConfig(config: any) {
            for (const [key, value] of Object.entries(config)) {
                if (typeof value === 'object' && !Array.isArray(value)) {
                    const existing = _.get(baseConfig, key) ?? {}
                    const merged = _.merge(existing, value)
                    _.set(baseConfig, key, merged)
                } else {
                    _.set(baseConfig, key, value)
                }
            }
        }

        const customConfiguration = config?.customConfiguration
        if (customConfiguration) {
            mergeWithBaseConfig(customConfiguration)
        }

        const fromCustomConfigurationJson = config?.customConfigurationJson
        if (fromCustomConfigurationJson) {
            mergeWithBaseConfig(JSON.parse(fromCustomConfigurationJson))
        }

        const fromBaseConfig = _.get(baseConfig, section)
        const fromDict = _.get(this.dictionary, section)
        if (
            typeof fromBaseConfig === 'object' &&
            typeof fromDict === 'object' &&
            !Array.isArray(fromBaseConfig) &&
            !Array.isArray(fromDict)
        ) {
            return structuredClone(_.extend(fromBaseConfig, fromDict))
        }
        if (fromDict !== undefined) {
            return structuredClone(fromDict)
        }
        if (fromBaseConfig !== undefined) {
            return fromBaseConfig
        }

        return defaultConfigurationValue(section) ?? defaultValue
    }

    public has(section: string): boolean {
        const NotFound = {}
        return this.get(section, NotFound) !== NotFound
    }

    public inspect<T>(section: string):
        | {
              key: string
              defaultValue?: T | undefined
              globalValue?: T | undefined
              workspaceValue?: T | undefined
              workspaceFolderValue?: T | undefined
              defaultLanguageValue?: T | undefined
              globalLanguageValue?: T | undefined
              workspaceLanguageValue?: T | undefined
              workspaceFolderLanguageValue?: T | undefined
              languageIds?: string[] | undefined
          }
        | undefined {
        const value = this.get(section)
        if (value === undefined) {
            return undefined
        }
        return {
            key: section,
            defaultValue: defaultConfigurationValue(section),
            globalValue: value,
            workspaceValue: value,
        }
    }

    public async update(
        section: string,
        value: any,
        _configurationTarget?: boolean | vscode.ConfigurationTarget | null | undefined,
        _overrideInLanguage?: boolean | undefined
    ): Promise<void> {
        if (this.get(section) === value) {
            return Promise.resolve()
        }

        this.put(section, value)
        if (this.onDidChange) {
            await this.onDidChange.cody_fireAsync({ affectsConfiguration: () => true })
        }
    }
}
