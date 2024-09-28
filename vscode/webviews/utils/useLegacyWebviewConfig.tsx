import { type LegacyWebviewConfig, isCodyProUser } from '@sourcegraph/cody-shared'
import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import {
    type FunctionComponent,
    type ReactNode,
    createContext,
    useContext,
    useEffect,
    useMemo,
} from 'react'
import type { UserAccountInfo } from '../Chat'
import { updateDisplayPathEnvInfoForWebview } from './displayPathEnvInfo'

const LegacyWebviewConfigContext = createContext<LegacyWebviewConfig | null>(null)

/**
 * React context provider for setting the {@link LegacyWebviewConfig} context value that can be read
 * with {@link useLegacyWebviewConfig}.
 */
export const LegacyWebviewConfigProvider: FunctionComponent<{
    children: ReactNode
}> = ({ children }) => {
    const legacyConfig = useExtensionAPI().legacyConfig
    const { value } = useObservable(useMemo(() => legacyConfig(), [legacyConfig]))

    useEffect(() => {
        updateDisplayPathEnvInfoForWebview(value?.workspaceFolderUris ?? [])
    }, [value?.workspaceFolderUris])

    return value === undefined ? null : (
        <LegacyWebviewConfigContext.Provider value={value}>
            {children}
        </LegacyWebviewConfigContext.Provider>
    )
}

export const LegacyWebviewConfigProviderForTestsOnly = LegacyWebviewConfigContext.Provider

/**
 * React hook for getting the {@link LegacyWebviewConfig}.
 */
export function useLegacyWebviewConfig(): LegacyWebviewConfig {
    const config = useContext(LegacyWebviewConfigContext)
    if (!config) {
        throw new Error(
            'useLegacyWebviewConfig must be used within a ConfigProvider with a non-null value'
        )
    }
    return config
}

export function useUserAccountInfo(): UserAccountInfo {
    const value = useLegacyWebviewConfig()
    if (!value.authStatus.authenticated) {
        throw new Error(
            'useUserAccountInfo must be used within a ConfigProvider with authenticated user'
        )
    }
    return {
        isCodyProUser: isCodyProUser(value.authStatus),
        // Receive this value from the extension backend to make it work
        // with E2E tests where change the DOTCOM_URL via the env variable TESTING_DOTCOM_URL.
        isDotComUser: value.isDotComUser,
        user: value.authStatus,
    }
}
