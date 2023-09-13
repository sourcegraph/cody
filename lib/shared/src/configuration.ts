export type ConfigurationUseContext = 'embeddings' | 'keyword' | 'none' | 'blended' | 'unified'

export const autocompleteAdvancedProviders = [
    'anthropic',
    'unstable-codegen',
    'unstable-fireworks',
    'unstable-azure-openai',
    'unstable-openai',
] as const

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
    experimentalChatPredictions: boolean
    inlineChat: boolean
    experimentalCommandLenses: boolean
    experimentalEditorTitleCommandIcon: boolean
    experimentalGuardrails: boolean
    experimentalNonStop: boolean
    experimentalLocalSymbols: boolean
    experimentalSymfPath: string
    experimentalSymfAnthropicKey: string
    autocompleteAdvancedProvider: (typeof autocompleteAdvancedProviders)[number] | null
    autocompleteAdvancedServerEndpoint: string | null
    autocompleteAdvancedModel: string | null
    autocompleteAdvancedAccessToken: string | null
    autocompleteAdvancedEmbeddings: boolean
    autocompleteExperimentalCompleteSuggestWidgetSelection?: boolean
    autocompleteExperimentalSyntacticPostProcessing?: boolean
    autocompleteExperimentalGraphContext?: boolean
    isRunningInsideAgent?: boolean
}

export interface ConfigurationWithAccessToken extends Configuration {
    /** The access token, which is stored in the secret storage (not configuration). */
    accessToken: string | null
}

const colors = ['red', 'green', 'yellow'] as const
interface Config {
    color: (typeof colors)[number] | null
}

const color: Config['color'] = 'blue'
