import type { FunctionComponent, ReactNode } from 'react'

/**
 * A wrapper component, used with {@link ComposedWrappers}.
 */
export type Wrapper<V = any, P extends { children: ReactNode } = any> =
    | {
          provider: React.Provider<V>
          value: V
      }
    | { component: React.ComponentType<P>; props?: Omit<P, 'children'> }

/**
 * A React component that composes wrappers (which can be React context providers or other
 * components) from an array, which is nicer than a deeply nested JSX syntax tree that would
 * otherwise be needed.
 */
export const ComposedWrappers: FunctionComponent<{ wrappers: Wrapper[]; children: ReactNode }> = ({
    wrappers,
    children,
}) => {
    return composeWrappers(wrappers, children)
}
function composeWrappers(wrappers: Wrapper[], children: ReactNode): ReactNode {
    return wrappers.reduce((acc, wrapper) => {
        if ('provider' in wrapper) {
            return <wrapper.provider value={wrapper.value}>{acc}</wrapper.provider>
        }
        return (
            <wrapper.component key={0} {...wrapper.props}>
                {acc}
            </wrapper.component>
        )
    }, children)
}
