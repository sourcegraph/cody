import type * as vscode from 'vscode'

import type { Configuration } from '@sourcegraph/cody-shared/src/configuration'

import { ClientInfo, ExtensionConfiguration } from './protocol-alias'

export class AgentWorkspaceConfiguration implements vscode.WorkspaceConfiguration {
    constructor(
        private prefix: string[] = [],
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
        return [section, ...this.prefix].join('.')
    }

    private clientNameToIDE(value: string): Configuration['agentIDE'] | undefined {
        switch (value.toLowerCase()) {
            case 'vscode':
                return 'VSCode'
            case 'jetbrains':
                return 'JetBrains'
            case 'emacs':
                return 'Emacs'
            case 'neovim':
                return 'Neovim'
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
            case 'cody.proxy':
                return extensionConfig?.proxy ?? null
            case 'cody.customHeaders':
                return extensionConfig?.customHeaders
            case 'cody.telemetry.level':
                // Use the dedicated `telemetry/recordEvent` to send telemetry from
                // agent clients.  The reason we disable telemetry via config is
                // that we don't want to submit vscode-specific events when
                // running inside the agent.
                return 'agent'
            case 'cody.autocomplete.enabled':
                return true
            case 'cody.autocomplete.advanced.provider':
                return extensionConfig?.autocompleteAdvancedProvider ?? null
            case 'cody.autocomplete.advanced.model':
                return extensionConfig?.autocompleteAdvancedModel ?? null
            case 'cody.advanced.agent.running':
                return true
            case 'cody.debug.enable':
                return extensionConfig?.debug ?? false
            case 'cody.debug.verbose':
                return extensionConfig?.verboseDebug ?? false
            case 'cody.autocomplete.experimental.syntacticPostProcessing':
                // False because we don't embed WASM with the agent yet.
                return false
            case 'cody.experimental.symfContext':
                // Symf is disabled because the tests fail with the following error when symf is enabled:
                //   EvalError: symf index creation failed: Error: spawn Unknown system error -8
                return false
            case 'cody.codebase':
                return extensionConfig?.codebase
            case 'cody.advanced.agent.ide':
                return this.clientNameToIDE(this.clientInfo()?.name ?? '')
            default:
                return defaultValue
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
