import {
    type ContextItem,
    type GenericVSCodeWrapper,
    type Model,
    type WebviewToExtensionAPI,
    createExtensionAPI,
    createMessageAPIForWebview,
} from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { type FunctionComponent, type ReactNode, createContext, useContext, useMemo } from 'react'

const context = createContext<WebviewToExtensionAPI | undefined>(undefined)

export const ExtensionAPIProviderFromVSCodeAPI: FunctionComponent<{
    vscodeAPI: GenericVSCodeWrapper<any, any>
    staticInitialContext?: ContextItem[]
    children: ReactNode
}> = ({ vscodeAPI, staticInitialContext, children }) => {
    const extensionAPI = useMemo<WebviewToExtensionAPI>(
        () => createExtensionAPI(createMessageAPIForWebview(vscodeAPI), staticInitialContext),
        [vscodeAPI, staticInitialContext]
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

export const MOCK_API = new Proxy<Partial<WebviewToExtensionAPI>>(
    {
        chatModels: () => Observable.of<Model[]>([]),
        evaluatedFeatureFlag: () => Observable.of<boolean | undefined>(false),
    },
    {
        get: (obj, property) => {
            if (Object.hasOwn(obj, property)) {
                return (obj as any)[property]
            }
            return () => {
                throw new Error(`${String(property)} is not implemented on MOCK_API`)
            }
        },
    }
) as WebviewToExtensionAPI
