import {
    type FunctionComponent,
    type ReactNode,
    createContext,
    useContext,
    useEffect,
    useMemo,
} from 'react'
import type { ExtensionMessage } from '../../src/chat/protocol'

type ClientActionArg = Omit<Extract<ExtensionMessage, { type: 'clientAction' }>, 'type'>

export type ClientActionListener = (arg: ClientActionArg) => void

interface ClientActionListenersInWebview {
    listen(listener: ClientActionListener): () => void
    dispatch(arg: ClientActionArg, opts?: { buffer?: boolean }): void
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
        const actionBuffer: ClientActionArg[] = []
        return {
            listen: (listener: (arg: ClientActionArg) => void) => {
                listeners.push(listener)

                // Replay buffer. (`listener` is the only listener at this point.)
                while (true) {
                    const action = actionBuffer.shift()
                    if (!action) {
                        break
                    }
                    listener(action)
                }

                return () => {
                    const i = listeners.indexOf(listener)
                    if (i !== -1) {
                        listeners.splice(i, 1)
                    }
                }
            },
            dispatch: (arg: ClientActionArg, opts?: { buffer?: boolean }): void => {
                // If no listeners, then buffer it until there is one.
                if (opts?.buffer && listeners.length === 0) {
                    actionBuffer.push(arg)
                }

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
export function useClientActionDispatcher(): ClientActionListenersInWebview['dispatch'] {
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
