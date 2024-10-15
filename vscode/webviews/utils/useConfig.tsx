import { isCodyProUser } from '@sourcegraph/cody-shared'
import {
    type ComponentProps,
    type FunctionComponent,
    type ReactNode,
    createContext,
    useContext,
    useMemo,
} from 'react'
import type { ExtensionMessage } from '../../src/chat/protocol'
import type { UserAccountInfo } from '../Chat'

export interface Config
    extends Pick<
        Extract<ExtensionMessage, { type: 'config' }>,
        | 'config'
        | 'clientCapabilities'
        | 'authStatus'
        | 'configFeatures'
        | 'isDotComUser'
        | 'userProductSubscription'
    > {}

const ConfigContext = createContext<Config | null>(null)

/**
 * React context provider whose `value` is the {@link Config}.
 */
export const ConfigProvider: FunctionComponent<{
    value: ComponentProps<(typeof ConfigContext)['Provider']>['value']
    children: ReactNode
}> = ({ value, children }) =>
    value ? <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider> : <>{children}</>

/**
 * React hook for getting the {@link Config}.
 */
export function useConfig(): Config {
    const config = useContext(ConfigContext)
    if (!config) {
        throw new Error('useConfig must be used within a ConfigProvider')
    }
    return config
}

export function useUserAccountInfo(): UserAccountInfo {
    const { authStatus, isDotComUser, clientCapabilities, userProductSubscription } = useConfig()

    if (!authStatus.authenticated) {
        throw new Error(
            'useUserAccountInfo must be used within a ConfigProvider with authenticated user'
        )
    }
    return useMemo<UserAccountInfo>(
        () => ({
            isCodyProUser: isCodyProUser(authStatus, userProductSubscription ?? null),
            // Receive this value from the extension backend to make it work
            // with E2E tests where change the DOTCOM_URL via the env variable TESTING_DOTCOM_URL.
            isDotComUser: isDotComUser,
            user: authStatus,
            IDE: clientCapabilities.agentIDE,
        }),
        [authStatus, isDotComUser, clientCapabilities, userProductSubscription]
    )
}
