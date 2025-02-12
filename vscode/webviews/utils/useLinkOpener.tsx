import { type FunctionComponent, type ReactNode, createContext, useContext } from 'react'

import type { GenericVSCodeWrapper } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'

interface LinkOpener {
    openExternalLink: (uri: string) => void
}

const LinkOpenerContext = createContext<LinkOpener | null>(null)

export const LinkOpenerProvider: FunctionComponent<{
    vscodeAPI: GenericVSCodeWrapper<any, any>
    children: ReactNode
}> = ({ vscodeAPI, children }) => {
    const value = {
        openExternalLink: (uri: string) =>
            void vscodeAPI.postMessage({
                command: 'openURI',
                uri: URI.parse(uri),
            }),
    }
    return <LinkOpenerContext.Provider value={value}>{children}</LinkOpenerContext.Provider>
}

/**
 * React hook for getting the {@link LinkOpener}.
 */
export function useLinkOpener(): LinkOpener | null {
    return useContext(LinkOpenerContext)
}
