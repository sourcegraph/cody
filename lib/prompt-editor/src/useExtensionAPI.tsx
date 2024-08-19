import {
    type GenericVSCodeWrapper,
    type WebviewToExtensionAPI,
    createMessageAPIForWebview,
    proxyExtensionAPI,
} from '@sourcegraph/cody-shared'
import { type FunctionComponent, type ReactNode, createContext, useContext, useMemo } from 'react'

const context = createContext<WebviewToExtensionAPI | undefined>(undefined)

export const ExtensionAPIProviderFromVSCodeAPI: FunctionComponent<{
    vscodeAPI: GenericVSCodeWrapper<any, any>
    children: ReactNode
}> = ({ vscodeAPI, children }) => {
    const extensionAPI = useMemo<WebviewToExtensionAPI>(() => {
        const messageAPI = createMessageAPIForWebview(vscodeAPI)
        return {
            mentionMenuData: proxyExtensionAPI(messageAPI, 'mentionMenuData'),
            evaluatedFeatureFlag: proxyExtensionAPI(messageAPI, 'evaluatedFeatureFlag'),
            prompts: proxyExtensionAPI(messageAPI, 'prompts'),
        }
    }, [vscodeAPI])
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
