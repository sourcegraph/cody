import type { FeatureFlag } from '@sourcegraph/cody-shared'
import {
    type ComponentProps,
    type FunctionComponent,
    type ReactNode,
    createContext,
    useContext,
} from 'react'

const FeatureFlagsContext = createContext<Record<string, boolean> | undefined>(undefined)

/**
 * React context provider whose `value` is the exported feature flags.
 */
export const FeatureFlagsProvider: FunctionComponent<{
    value: ComponentProps<(typeof FeatureFlagsContext)['Provider']>['value']
    children: ReactNode
}> = ({ value, children }) =>
    value ? (
        <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>
    ) : (
        <>{children}</>
    )

/**
 * React hook for getting a feature flag's value.
 *
 * @returns `true` or `false` if the flag is exposed by the server endpoint, has been fetched, and
 * is not stale. Otherwise `undefined` (which callers should usually treat as `false`).
 */
export function useFeatureFlag(flagName: FeatureFlag): boolean | undefined {
    const flags = useContext(FeatureFlagsContext)
    if (flags === undefined) {
        throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider')
    }
    return flags[flagName]
}
