import {
    type Client,
    type ExtHostAPI,
    createConnectionFromWebviewToExtHost,
    hydrateAfterPostMessage,
} from '@sourcegraph/cody-shared'
import { createContext, useContext } from 'react'
import { URI } from 'vscode-uri'
import type { VSCodeWrapper } from './VSCodeApi'

/** React context to set the extension host API client. */
export const ExtHostClientContext = createContext<Client<ExtHostAPI> | null>(null)

/**
 * Helper function for creating the extension host API client. Set this value in React context with
 * {@link ExtHostClientContext.Provider}.
 */
export function createExtHostClient(
    vscodeAPI: Pick<VSCodeWrapper, 'postMessage' | 'onMessage'>
): Client<ExtHostAPI> {
    return createConnectionFromWebviewToExtHost(
        { vscodeAPI },
        {
            helloWorld() {
                return Promise.resolve('Hello, world! from the webview')
            },
        },
        {
            hydrate: message => hydrateAfterPostMessage(message, uri => URI.from(uri as any)),
            logger: console,
        }
    )
}

/**
 * A React hook used by the webview to get a client to call the extension host API.
 */
export function useExtHostClient(): Client<ExtHostAPI>['proxy'] {
    const client = useContext(ExtHostClientContext)
    if (!client) {
        throw new Error(
            'useExtHostClient must be used within an ExtHostClientContext with a non-null value set'
        )
    }
    return client.proxy
}
