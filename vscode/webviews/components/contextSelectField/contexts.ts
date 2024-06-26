import type { Context } from '@sourcegraph/cody-shared'
import { createContext, useContext, useMemo, useState } from 'react'

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

const context = createContext<ContextsContext | null>(null)

export const ContextsContextProvider = context.Provider

export function useContexts(): ContextsContext | null {
    return useContext(context)
}

export function useContextsValue(): {
    contextValue: ContextsContext | null
    setContextsData: (data: Pick<ContextsContext, 'contexts' | 'currentContext'> | null) => void
} {
    const [contexts, setContexts] = useState<Context[] | null>(null)
    const [currentContext, setCurrentContext] = useState<Context | null>(null)
    return useMemo(
        () => ({
            contextValue:
                contexts !== null
                    ? {
                          contexts,
                          currentContext,
                          onCurrentContextChange: setCurrentContext,
                      }
                    : null,
            setContextsData: data => {
                setContexts(data ? data.contexts : null)
                setCurrentContext(data ? data.currentContext : null)
            },
        }),
        [contexts, currentContext]
    )
}
