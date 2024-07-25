import {
    type ComponentProps,
    type FunctionComponent,
    type ReactNode,
    createContext,
    useContext,
} from 'react'
import type { ExtensionMessage } from '../../src/chat/protocol'

export interface Config
    extends Pick<Extract<ExtensionMessage, { type: 'config' }>, 'config' | 'authStatus'> {}

const ConfigContext = createContext<Config | undefined>(undefined)

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
export function useConfig(): Config
export function useConfig(allowUndefined: 'allow-undefined'): Config | undefined
export function useConfig(allowUndefined?: 'allow-undefined'): Config | undefined {
    const config = useContext(ConfigContext)
    if (!config && allowUndefined !== 'allow-undefined') {
        throw new Error('useConfig must be used within a ConfigProvider')
    }
    return config
}
