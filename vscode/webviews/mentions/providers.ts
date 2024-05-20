import {
    type ContextMentionProviderMetadata,
    allMentionProvidersMetadata,
} from '@sourcegraph/cody-shared'
import { createContext, useContext } from 'react'

/** React context data for the available context providers. */
export interface ContextProviderContext {
    providers: ContextMentionProviderMetadata[]
}

const context = createContext<ContextProviderContext>({
    providers: allMentionProvidersMetadata({ experimentalNoodle: false, experimentalURLContext: false }),
})

export const WithContextProviders = context.Provider

export function useContextProviders(): ContextProviderContext['providers'] {
    return useContext(context).providers
}
