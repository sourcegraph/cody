export type ConfigurationUseContext = 'embeddings' | 'keyword' | 'none' | 'blended' | 'unified'

/**
 * Get the numeric ID corresponding to the ConfigurationUseContext mode.
 */
export const CONTEXT_SELECTION_ID: Record<ConfigurationUseContext, number> = {
    none: 0,
    embeddings: 1,
    keyword: 2,
    blended: 10,
    unified: 11,
}

// Should we share VS Code specific config via cody-shared?
export interface Configuration {
    serverEndpoint: string
    proxy?: string | null
    codebase?: string
    debugEnable: boolean
    debugFilter: RegExp | null
    debugVerbose: boolean
    telemetryLevel: 'all' | 'off' | 'agent'
    useContext: ConfigurationUseContext
    customHeaders: Record<string, string>
    chatPreInstruction: string
    autocomplete: boolean
    autocompleteLanguages: Record<string, boolean>
    inlineChat: boolean
    codeActions: boolean
    experimentalChatPanel: boolean
    experimentalChatPredictions: boolean
    experimentalSearchPanel: boolean
    commandCodeLenses: boolean
    experimentalSimpleChatContext: boolean
    editorTitleCommandIcon: boolean
    experimentalGuardrails: boolean
    experimentalNonStop: boolean
    experimentalLocalSymbols: boolean
    autocompleteAdvancedProvider: 'anthropic' | 'fireworks' | 'unstable-openai' | null
    autocompleteAdvancedServerEndpoint: string | null
    autocompleteAdvancedModel: string | null
    autocompleteAdvancedAccessToken: string | null
    autocompleteCompleteSuggestWidgetSelection?: boolean
    autocompleteExperimentalSyntacticPostProcessing?: boolean
    autocompleteExperimentalDynamicMultilineCompletions?: boolean
    autocompleteExperimentalGraphContext: 'lsp-light' | 'bfg' | 'bfg-mixed' | null
    isRunningInsideAgent?: boolean
    agentIDE?: 'VSCode' | 'JetBrains' | 'Neovim' | 'Emacs'
    autocompleteTimeouts: AutocompleteTimeouts
}

export interface AutocompleteTimeouts {
    multiline?: number
    singleline?: number
}

export interface ConfigurationWithAccessToken extends Configuration {
    /** The access token, which is stored in the secret storage (not configuration). */
    accessToken: string | null
}
