import type { ClientStateForWebview } from '@sourcegraph/cody-shared'
import {
    type FunctionComponent,
    type ReactNode,
    createContext,
    useContext,
    useEffect,
    useMemo,
} from 'react'
import type { ExtensionMessage } from '../../src/chat/protocol'

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

/////////////////////////

type ClientActionArg = Omit<Extract<ExtensionMessage, { type: 'clientAction' }>, 'type'>

export type ClientActionListener = (arg: ClientActionArg) => void

interface ClientActionListenersInWebview {
    listen(listener: ClientActionListener): () => void
    dispatch(arg: ClientActionArg): void
}

const ClientActionListenersContext = createContext<ClientActionListenersInWebview | null>(null)

/**
 * React context provider that allows descendants to listen for actions from the client (such as VS
 * Code) in the `clientAction` protocol message.
 */
export const ClientActionListenersContextProvider: FunctionComponent<{ children: ReactNode }> = ({
    children,
}) => {
    const clientActionListeners = useMemo<ClientActionListenersInWebview>(() => {
        const listeners: ClientActionListener[] = []
        return {
            listen: (listener: (arg: ClientActionArg) => void) => {
                listeners.push(listener)
                return () => {
                    const i = listeners.indexOf(listener)
                    if (i !== -1) {
                        listeners.splice(i, 1)
                    }
                }
            },
            dispatch: (arg: ClientActionArg): void => {
                for (const listener of listeners) {
                    listener(arg)
                }
            },
        }
    }, [])
    return (
        <ClientActionListenersContext.Provider value={clientActionListeners}>
            {children}
        </ClientActionListenersContext.Provider>
    )
}

/**
 * Get the dispatch function to call in the webview when it receives an action from the client (such
 * as VS Code) in the `clientAction` protocol message.
 */
export function useClientActionDispatcher(): (arg: ClientActionArg) => void {
    const clientActionListeners = useContext(ClientActionListenersContext)
    if (!clientActionListeners) {
        throw new Error('no clientActionListeners')
    }
    return clientActionListeners.dispatch
}

/**
 * Register a listener for an action from the client (such as VS Code) sent in the `clientAction`
 * protocol message.
 *
 * NOTE: You should memoize {@link listener}.
 */
export function useClientActionListener(listener: ClientActionListener): void {
    const clientActionListeners = useContext(ClientActionListenersContext)
    if (!clientActionListeners) {
        throw new Error('no clientActionListener')
    }
    useEffect(() => {
        return clientActionListeners.listen(listener)
    }, [clientActionListeners, listener])
}
