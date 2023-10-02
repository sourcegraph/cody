import { OllamaOptions } from './modelProviders/ollama'

export type ConfigurationUseContext = 'embeddings' | 'keyword' | 'none' | 'blended' | 'unified'

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
    inlineChat: boolean
    codeActions: boolean
    experimentalChatPredictions: boolean
    experimentalCommandLenses: boolean
    experimentalEditorTitleCommandIcon: boolean
    experimentalGuardrails: boolean
    experimentalNonStop: boolean
    experimentalLocalSymbols: boolean
    autocompleteAdvancedProvider:
        | 'anthropic'
        | 'unstable-codegen'
        | 'unstable-fireworks'
        | 'unstable-openai'
        | 'ollama-experimental'
        | null
    autocompleteAdvancedServerEndpoint: string | null
    autocompleteAdvancedModel: string | null
    autocompleteAdvancedAccessToken: string | null
    autocompleteExperimentalCompleteSuggestWidgetSelection?: boolean
    autocompleteExperimentalSyntacticPostProcessing?: boolean
    autocompleteExperimentalGraphContext?: boolean
    autocompleteExperimentalOllamaOptions?: OllamaOptions
    isRunningInsideAgent?: boolean
}

export interface ConfigurationWithAccessToken extends Configuration {
    /** The access token, which is stored in the secret storage (not configuration). */
    accessToken: string | null
}
