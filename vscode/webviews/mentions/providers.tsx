import {
    type ContextMentionProviderMetadata,
    allMentionProvidersMetadata,
} from '@sourcegraph/cody-shared'
import { createContext, useContext, useEffect, useState } from 'react'
import { getVSCodeAPI } from '../utils/VSCodeApi'

/** React context data for the available context providers. */
export interface ContextProviderContext {
    providers: Promise<ContextMentionProviderMetadata[]> | ContextMentionProviderMetadata[]
}

const context = createContext<ContextProviderContext>({
    providers: allMentionProvidersMetadata({
        experimentalNoodle: false,
        experimentalURLContext: false,
    }),
})

const getAllMentionProvidersMetadata = async (): Promise<ContextMentionProviderMetadata[]> => {
    return new Promise(resolve => {
        const vscodeApi = getVSCodeAPI()
        vscodeApi.postMessage({ command: 'getAllMentionProvidersMetadata' })

        const RESPONSE_MESSAGE_TYPE = 'allMentionProvidersMetadata' as const

        // Clean up after a while to avoid resource exhaustion in case there is a bug
        // somewhere.
        const MAX_WAIT_SECONDS = 15
        const rejectTimeout = setTimeout(() => {
            resolve([])
            dispose()
        }, MAX_WAIT_SECONDS * 1000)

        // Wait for the response. We assume the first message of the right type is the response to
        // our call.
        const dispose = vscodeApi.onMessage(async message => {
            if (message.type === RESPONSE_MESSAGE_TYPE) {
                resolve(await (message.providers ?? []))
                dispose()
                clearTimeout(rejectTimeout)
            }
        })
    })
}

export const WithContextProviders = (props: { children: React.ReactElement }): React.ReactElement => {
    return (
        <context.Provider value={{ providers: getAllMentionProvidersMetadata() }}>
            {props.children}
        </context.Provider>
    )
}

export function useContextProviders(): ContextMentionProviderMetadata[] {
    const [resolvedProviders, setResolvedProviders] = useState<ContextMentionProviderMetadata[]>([])
    const { providers: providerPromise } = useContext(context)

    useEffect(() => {
        void (async () => {
            const providers = await providerPromise
            setResolvedProviders(providers)
        })()
    }, [providerPromise])

    return resolvedProviders
}
