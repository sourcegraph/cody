export type ConfigurationUseContext = 'embeddings' | 'keyword' | 'none' | 'blended' | 'unified'

// Should we share VS Code specific config via cody-shared?
export interface Configuration {
    serverEndpoint: string
    codebase?: string
    debugEnable: boolean
    debugFilter: RegExp | null
    debugVerbose: boolean
    telemetryLevel: 'all' | 'off'
    useContext: ConfigurationUseContext
    customHeaders: Record<string, string>
    autocomplete: boolean
    experimentalChatPredictions: boolean
    inlineChat: boolean
    experimentalCommandLenses: boolean
    experimentalEditorTitleCommandIcon: boolean
    experimentalGuardrails: boolean
    experimentalNonStop: boolean
    experimentalLocalSymbols: boolean
    experimentalSymfPath: string
    experimentalSymfAnthropicKey: string
    autocompleteAdvancedProvider:
        | 'anthropic'
        | 'unstable-codegen'
        | 'unstable-huggingface'
        | 'unstable-fireworks'
        | 'unstable-azure-openai'
    autocompleteAdvancedServerEndpoint: string | null
    autocompleteAdvancedModel: string | null
    autocompleteAdvancedAccessToken: string | null
    autocompleteAdvancedEmbeddings: boolean
    autocompleteExperimentalCompleteSuggestWidgetSelection?: boolean
    autocompleteExperimentalSyntacticPostProcessing?: boolean
    pluginsEnabled?: boolean
    pluginsDebugEnabled?: boolean
    isRunningInsideAgent?: boolean
    pluginsConfig?: {
        confluence?: {
            baseUrl: string
            email?: string
            apiToken?: string
        }
        github?: {
            apiToken?: string
            baseURL?: string
            org?: string
            repo?: string
        }
        apiNinjas?: {
            apiKey?: string
        }
    }
}

export interface ConfigurationWithAccessToken extends Configuration {
    /** The access token, which is stored in the secret storage (not configuration). */
    accessToken: string | null
}
