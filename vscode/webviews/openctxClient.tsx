import {
    type GenericVSCodeWrapper,
    createExtensionAPIProxyInWebview,
    createMessageAPIForWebview,
    proxyExtensionAPI,
} from '@sourcegraph/cody-shared'
import { type ChatContextClient, ChatContextClientProvider } from '@sourcegraph/prompt-editor'
import { type FunctionComponent, type ReactNode, useMemo } from 'react'
import type { VSCodeWrapper } from './utils/VSCodeApi'

export const ChatContextClientProviderFromVSCodeAPI: FunctionComponent<{
    vscodeAPI: VSCodeWrapper | null
    children: ReactNode
}> = ({ vscodeAPI, children }) => {
    const value = useMemo<ChatContextClient | null>(
        () =>
            vscodeAPI
                ? {
                      getChatContextItems: createExtensionAPIProxyInWebview(
                          vscodeAPI,
                          'queryContextItems',
                          'userContextFiles'
                      ),
                      mentionProviders: proxyExtensionAPI(
                          createMessageAPIForWebview(vscodeAPI as GenericVSCodeWrapper<any, any>), // TODO!(sqs): type
                          'mentionProviders'
                      ),
                  }
                : null,
        [vscodeAPI]
    )
    return value ? (
        <ChatContextClientProvider value={value}>{children}</ChatContextClientProvider>
    ) : (
        <>{children}</>
    )
}
