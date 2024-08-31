import {
    type GenericVSCodeWrapper,
    type WebviewToExtensionAPI,
    createExtensionAPI,
    createMessageAPIForWebview,
} from '@sourcegraph/cody-shared'
import { type FunctionComponent, type ReactNode, createContext, useContext, useMemo } from 'react'

const context = createContext<WebviewToExtensionAPI | undefined>(undefined)

export const ExtensionAPIProviderFromVSCodeAPI: FunctionComponent<{
    vscodeAPI: GenericVSCodeWrapper<any, any>
    children: ReactNode
}> = ({ vscodeAPI, children }) => {
    const extensionAPI = useMemo<WebviewToExtensionAPI>(
        () => createExtensionAPI(createMessageAPIForWebview(vscodeAPI)),
        [vscodeAPI]
    )
    return <context.Provider value={extensionAPI}>{children}</context.Provider>
}

export const ExtensionAPIProviderForTestsOnly = context.Provider

/**
 * The API exposed by the extension host to the webview.
 */
export function useExtensionAPI<M extends keyof WebviewToExtensionAPI>(): Pick<
    WebviewToExtensionAPI,
    M
> {
    const extensionAPI = useContext(context)
    if (!extensionAPI) {
        throw new Error(
            'useExtensionAPI must be used within an ExtensionAPIProviderFromVSCodeAPI or ExtensionAPIProviderForTestsOnly component'
        )
    }
    return extensionAPI
}

export const MOCK_API = new Proxy(
    {},
    {
        get: (_, property) => {
            return () => {
                throw new Error(`${String(property)} is not implemented on MOCK_API`)
            }
        },
    }
) as WebviewToExtensionAPI
