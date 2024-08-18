import { CodyIDE, isCodyProUser } from '@sourcegraph/cody-shared'
import {
    type ComponentProps,
    type FunctionComponent,
    type ReactNode,
    createContext,
    useContext,
} from 'react'
import type { ExtensionMessage } from '../../src/chat/protocol'
import type { UserAccountInfo } from '../Chat'

export interface Config
    extends Pick<
        Extract<ExtensionMessage, { type: 'config' }>,
        'config' | 'authStatus' | 'configFeatures'
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
    const value = useConfig()
    return {
        isCodyProUser: isCodyProUser(value.authStatus),
        // Receive this value from the extension backend to make it work
        // with E2E tests where change the DOTCOM_URL via the env variable TESTING_DOTCOM_URL.
        isDotComUser: value.authStatus.isDotCom,
        user: value.authStatus,
        ide: value.config.agentIDE ?? CodyIDE.VSCode,
    }
}
