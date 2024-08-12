import type { ClientStateForWebview } from '@sourcegraph/cody-shared'
import { createContext, useContext } from 'react'

const ClientStateContext = createContext<ClientStateForWebview | null>(null)

export const ClientStateContextProvider = ClientStateContext.Provider

/**
 * Get the {@link ClientState} stored in React context.
 */
export function useClientState(): ClientStateForWebview {
    const clientState = useContext(ClientStateContext)
    if (!clientState) {
        throw new Error('no clientState')
    }
    return clientState
}
