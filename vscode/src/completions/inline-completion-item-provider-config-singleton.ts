import type { ResolvedConfiguration } from '@sourcegraph/cody-shared'
import type { CodyStatusBar } from '../services/StatusBar'
import type { BfgRetriever } from './context/retrievers/bfg/bfg-retriever'
import type { Provider } from './providers/shared/provider'
import type { ProvideInlineCompletionItemsTracer } from './tracer'

export interface CodyCompletionItemProviderConfig {
    provider: Provider
    firstCompletionTimeout: number
    statusBar: CodyStatusBar
    tracer?: ProvideInlineCompletionItemsTracer | null
    isRunningInsideAgent?: boolean
    config: ResolvedConfiguration

    isDotComUser?: boolean

    createBfgRetriever?: () => BfgRetriever

    // Settings
    formatOnAccept?: boolean
    disableInsideComments?: boolean
    triggerDelay: number

    // Feature flags
    completeSuggestWidgetSelection?: boolean
}

export type InlineCompletionItemProviderConfig = Omit<
    CodyCompletionItemProviderConfig,
    'createBfgRetriever'
> &
    Required<Pick<CodyCompletionItemProviderConfig, 'isDotComUser'>>

/**
 * A singleton that manages the configuration for the inline completion item provider.
 * The configuration is set using the `set` method, and can be accessed using the `configuration` getter.
 * If the configuration has not been set, an error will be thrown when accessing the `configuration` getter.
 */
export const InlineCompletionItemProviderConfigSingleton = {
    _configuration: null as InlineCompletionItemProviderConfig | null,
    get configuration(): InlineCompletionItemProviderConfig {
        if (!InlineCompletionItemProviderConfigSingleton._configuration) {
            throw new Error('InlineCompletionItemProviderConfigSingleton not initialized')
        }
        return InlineCompletionItemProviderConfigSingleton._configuration
    },

    set(config: InlineCompletionItemProviderConfig): void {
        InlineCompletionItemProviderConfigSingleton._configuration = config
    },
}
