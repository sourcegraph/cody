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
        'config' | 'clientCapabilities' | 'authStatus' | 'siteHasCodyEnabled'
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
    const { authStatus, clientCapabilities, siteHasCodyEnabled } = useConfig()

    if (!authStatus.authenticated) {
        throw new Error(
            'useUserAccountInfo must be used within a ConfigProvider with authenticated user'
        )
    }
    return useMemo<UserAccountInfo>(
        () => ({
            user: authStatus,
            IDE: clientCapabilities.agentIDE,
            siteHasCodyEnabled,
        }),
        [authStatus, clientCapabilities, siteHasCodyEnabled]
    )
}
