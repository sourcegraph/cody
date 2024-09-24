import type * as vscode from 'vscode'

import { type ClientConfiguration, CodyIDE } from '@sourcegraph/cody-shared'

import { defaultConfigurationValue } from '../../vscode/src/configuration-keys'

import type { ClientInfo, ExtensionConfiguration } from './protocol-alias'

export class AgentWorkspaceConfiguration implements vscode.WorkspaceConfiguration {
    constructor(
        private prefix: string[],
        private clientInfo: () => ClientInfo | undefined,
        private extensionConfig: () => ExtensionConfiguration | undefined,
        private dictionary: Record<string, any> = {}
    ) {}

    public withPrefix(prefix: string): AgentWorkspaceConfiguration {
        return new AgentWorkspaceConfiguration(
            this.prefix.concat(prefix),
            this.clientInfo,
            this.extensionConfig,
            this.dictionary
        )
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
            default:
                return undefined
        }
    }

    public get(userSection: string, defaultValue?: unknown): any {
        const section = this.actualSection(userSection)

        const fromDictionary = this.dictionary?.[section]
        if (fromDictionary !== undefined) {
            return fromDictionary
        }
        const extensionConfig = this.extensionConfig()

        const fromCustomConfiguration = extensionConfig?.customConfiguration?.[section]
        if (fromCustomConfiguration !== undefined) {
            return fromCustomConfiguration
        }
        switch (section) {
            case 'cody.serverEndpoint':
                return extensionConfig?.serverEndpoint
            case 'cody.customHeaders':
                return extensionConfig?.customHeaders
            case 'cody.telemetry.level':
                // Use the dedicated `telemetry/recordEvent` to send telemetry from
                // agent clients.  The reason we disable telemetry via config is
                // that we don't want to submit vscode-specific events when
                // running inside the agent.
                return 'agent'
            case 'cody.telemetry.clientName':
                return extensionConfig?.telemetryClientName
            case 'cody.autocomplete.enabled':
                return true
            case 'cody.autocomplete.advanced.provider':
                return extensionConfig?.autocompleteAdvancedProvider ?? null
            case 'cody.autocomplete.advanced.model':
                return extensionConfig?.autocompleteAdvancedModel ?? null
            case 'cody.advanced.agent.running':
                return true
            case 'cody.debug.verbose':
                return extensionConfig?.verboseDebug ?? false
            case 'cody.experimental.tracing':
                return extensionConfig?.verboseDebug ?? false
            case 'cody.useContext':
                // Disable embeddings by default.
                return 'keyword'
            case 'cody.codebase':
                return extensionConfig?.codebase
            case 'cody.advanced.agent.ide':
                return AgentWorkspaceConfiguration.clientNameToIDE(this.clientInfo()?.name ?? '')
            case 'cody.advanced.agent.ide.version':
                return this.clientInfo()?.ideVersion
            case 'cody.advanced.agent.extension.version':
                return this.clientInfo()?.version
            case 'cody.advanced.agent.capabilities.storage':
                switch (this.clientInfo()?.capabilities?.globalState) {
                    case 'server-managed':
                    case 'client-managed':
                        return true
                    default:
                        return false
                }
            case 'cody.advanced.hasNativeWebview':
                return this.clientInfo()?.capabilities?.webview === 'native' ?? false
            case 'editor.insertSpaces':
                return true // TODO: override from IDE clients
            default:
                // VS Code picks up default value in package.json, and only uses
                // the `defaultValue` parameter if package.json provides no
                // default.
                return defaultConfigurationValue(section) ?? defaultValue
        }
    }

    public has(section: string): boolean {
        const actual = this.actualSection(section)
        for (const key in this.dictionary) {
            if (key.startsWith(actual)) {
                return true
            }
        }
        return false
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
        return undefined
    }

    public async update(
        section: string,
        value: any,
        _configurationTarget?: boolean | vscode.ConfigurationTarget | null | undefined,
        _overrideInLanguage?: boolean | undefined
    ): Promise<void> {
        this.dictionary[this.actualSection(section)] = value
        return Promise.resolve()
    }
}
