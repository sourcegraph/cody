import type { CodyClientConfig } from '@sourcegraph/cody-shared'
import {
    type ComponentProps,
    type FunctionComponent,
    type ReactNode,
    createContext,
    useContext,
} from 'react'

const ClientConfigContext = createContext<CodyClientConfig | null>(null)

/**
 * React context provider whose `value` is the {@link CodyClientConfig}.
 */
export const ClientConfigProvider: FunctionComponent<{
    value: ComponentProps<(typeof ClientConfigContext)['Provider']>['value']
    children: ReactNode
}> = ({ value, children }) => (
    <ClientConfigContext.Provider value={value}>{children}</ClientConfigContext.Provider>
)

/**
 * React hook for getting the {@link CodyClientConfig}.
 */
export function useClientConfig(): CodyClientConfig | null {
    return useContext(ClientConfigContext)
}
