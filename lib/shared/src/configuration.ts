export type ConfigurationUseContext = 'embeddings' | 'keyword' | 'none' | 'blended' | 'unified'

/**
 * Get the numeric ID corresponding to the ConfigurationUseContext mode.
 */
export function getContextSelectionID(c: ConfigurationUseContext): number {
    switch (c) {
        case 'none':
            return 0

        case 'embeddings':
            return 1
        case 'keyword':
            return 2

        case 'blended':
            return 10
        case 'unified':
            return 11
    }
}

// Should we share VS Code specific config via cody-shared?
export interface Configuration {
    serverEndpoint: string
    proxy?: string | null
    codebase?: string
    debugEnable: boolean
    debugFilter: RegExp | null
    debugVerbose: boolean
    telemetryLevel: 'all' | 'off'
    useContext: ConfigurationUseContext
    customHeaders: Record<string, string>
    chatPreInstruction: string
    autocomplete: boolean
    autocompleteLanguages: Record<string, boolean>
    inlineChat: boolean
    codeActions: boolean
    experimentalChatPredictions: boolean
    experimentalCommandLenses: boolean
    experimentalEditorTitleCommandIcon: boolean
    experimentalGuardrails: boolean
    experimentalNonStop: boolean
    experimentalLocalSymbols: boolean
    autocompleteAdvancedProvider: 'anthropic' | 'fireworks' | 'unstable-openai' | null
    autocompleteAdvancedServerEndpoint: string | null
    autocompleteAdvancedModel: string | null
    autocompleteAdvancedAccessToken: string | null
    autocompleteCompleteSuggestWidgetSelection?: boolean
    autocompleteExperimentalSyntacticPostProcessing?: boolean
    autocompleteExperimentalGraphContext: 'lsp-light' | null
    isRunningInsideAgent?: boolean
}

export interface ConfigurationWithAccessToken extends Configuration {
    /** The access token, which is stored in the secret storage (not configuration). */
    accessToken: string | null
}
