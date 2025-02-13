import type { SerializedPromptEditorState } from '@sourcegraph/cody-shared'
import {
    type FunctionComponent,
    type ReactNode,
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
} from 'react'
import type { ExtensionMessage } from '../../src/chat/protocol'

type ClientActionArg = Omit<Extract<ExtensionMessage, { type: 'clientAction' }>, 'type'> & {
    editorState?: SerializedPromptEditorState
}

export type ClientActionListener = (arg: ClientActionArg) => void
type ClientActionListenerSelector = (arg: ClientActionArg) => boolean

interface ClientSubscriber {
    listener: ClientActionListener
    selector: ClientActionListenerSelector
}

interface ClientActionListenersInWebview {
    listen(subscriber: ClientSubscriber): () => void
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
        const subscribers: ClientSubscriber[] = []
        const actionBuffer: ClientActionArg[] = []

        return {
            listen: (subscriber: ClientSubscriber) => {
                subscribers.push(subscriber)

                const actionBufferCopy = [...actionBuffer]

                // Replay buffer
                for (let index = 0; index < actionBufferCopy.length; index++) {
                    const bufferEvent = actionBufferCopy[index]
                    if (subscriber.selector(bufferEvent)) {
                        subscriber.listener(bufferEvent)
                        // Remove original buffer event (buffer event is fired only once at first matched listener)
                        actionBuffer.splice(index, 1)
                    }
                }

                return () => {
                    const i = subscribers.indexOf(subscriber)
                    if (i !== -1) {
                        subscribers.splice(i, 1)
                    }
                }
            },
            dispatch: (arg: ClientActionArg, opts?: { buffer?: boolean }): void => {
                // If no listeners, then buffer it until there is one.
                if (opts?.buffer && subscribers.length === 0) {
                    actionBuffer.push(arg)
                }

                for (const subscriber of subscribers) {
                    if (subscriber.selector(arg)) {
                        subscriber.listener(arg)
                    }
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

interface ClientActionListenerOptions {
    isActive: boolean
    selector?: (event: ClientActionArg) => boolean
}

/**
 * Register a listener for an action from the client (such as VS Code) sent in the `clientAction`
 * protocol message.
 *
 * NOTE: You should memoize {@link listener}.
 */
export function useClientActionListener(
    props: ClientActionListenerOptions,
    listener: ClientActionListener
): void {
    const { isActive, selector } = props
    const clientActionListeners = useContext(ClientActionListenersContext)

    const selectorRef = useRef(selector)
    selectorRef.current = selector ?? (() => true)

    if (!clientActionListeners) {
        throw new Error('no clientActionListener')
    }

    useEffect(() => {
        if (!isActive) {
            return
        }
        return clientActionListeners.listen({
            listener,
            selector: selectorRef.current!,
        })
    }, [clientActionListeners, listener, isActive])
}
