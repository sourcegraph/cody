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
    proxy?: string | null
    codebase?: string
    debugEnable: boolean
    debugFilter: RegExp | null
    debugVerbose: boolean
    telemetryLevel: 'all' | 'off' | 'agent'
    useContext: ConfigurationUseContext
    customHeaders: Record<string, string>
    chatPreInstruction: string
    codeActions: boolean
    commandCodeLenses: boolean
    editorTitleCommandIcon: boolean

    /**
     * Autocomplete
     */
    autocomplete: boolean
    autocompleteLanguages: Record<string, boolean>
    autocompleteAdvancedProvider: 'anthropic' | 'fireworks' | 'unstable-openai' | null
    autocompleteAdvancedModel: string | null
    autocompleteCompleteSuggestWidgetSelection?: boolean
    autocompleteFormatOnAccept?: boolean

    /**
     * Experimental
     */
    experimentalGuardrails: boolean
    experimentalLocalSymbols: boolean
    experimentalSymfContext: boolean
    experimentalTracing: boolean
    experimentalSimpleChatContext: boolean
    experimentalChatPredictions: boolean

    /**
     * Experimental autocomplete
     */
    autocompleteExperimentalSyntacticPostProcessing?: boolean
    internalUnstable: boolean
    autocompleteExperimentalDynamicMultilineCompletions?: boolean
    autocompleteExperimentalHotStreak?: boolean
    autocompleteExperimentalGraphContext: 'lsp-light' | 'bfg' | 'bfg-mixed' | null

    /**
     * Hidden settings
     */
    isRunningInsideAgent?: boolean
    agentIDE?: 'VSCode' | 'JetBrains' | 'Neovim' | 'Emacs'
    autocompleteTimeouts: AutocompleteTimeouts

    testingLocalEmbeddingsModel: string | undefined
    testingLocalEmbeddingsEndpoint: string | undefined
    testingLocalEmbeddingsIndexLibraryPath: string | undefined
}

export interface AutocompleteTimeouts {
    multiline?: number
    singleline?: number
}

export interface ConfigurationWithAccessToken extends Configuration {
    serverEndpoint: string
    /** The access token, which is stored in the secret storage (not configuration). */
    accessToken: string | null
}
