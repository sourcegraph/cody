import { createContext, useContext } from 'react'

/**
 * React context data for {@link Context}s.
 *
 * NOTE(sqs): My deepest apologies for the name "ContextsContext".
 */
export interface ContextsContext {
    contexts: Context[]
    currentContext: Context | null
    onCurrentContextChange: (currentContext: Context | null) => void
}

/**
 * Pinnable, saved contexts. You can define a context on Sourcegraph, which is basically a reusable
 * snippet of text and some @-mentions that you can prepend to your chat message.
 *
 */
export interface Context {
    id: string
    name: string
    description?: string
    query: string
    default: boolean
    starred: boolean
}

const context = createContext<ContextsContext | null>(null)

export const ContextsContextProvider = context.Provider

export function useContexts(): ContextsContext | null {
    return useContext(context)
}
