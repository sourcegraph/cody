import { type ComponentProps, type FunctionComponent, type ReactNode, useMemo } from 'react'
import { ClientActionListenersContextProvider, ClientStateContextProvider } from './client/clientState'
import { TooltipProvider } from './components/shadcn/ui/tooltip'
import { ChatContextClientProviderForTestsOnly } from './promptEditor/plugins/atMentions/chatContextClient'
import { dummyChatContextClient } from './promptEditor/plugins/atMentions/fixtures'
import { ComposedWrappers, type Wrapper } from './utils/composeWrappers'
import { TelemetryRecorderContext } from './utils/telemetry'
import { ConfigProvider } from './utils/useConfig'

export const AppWrapper: FunctionComponent<{ children: ReactNode }> = ({ children }) => (
    <ComposedWrappers wrappers={COMMON_WRAPPERS}>{children}</ComposedWrappers>
)

/**
 * For use in tests only.
 */
export const TestAppWrapper: FunctionComponent<{ children: ReactNode }> = ({ children }) => {
    const wrappers = useMemo<Wrapper[]>(
        () => [
            ...COMMON_WRAPPERS,
            {
                provider: TelemetryRecorderContext.Provider,
                value: {
                    recordEvent: () => {},
                },
            } satisfies Wrapper<ComponentProps<typeof TelemetryRecorderContext.Provider>['value']>,
            {
                provider: ClientStateContextProvider,
                value: { initialContext: [] },
            } satisfies Wrapper<ComponentProps<typeof ClientStateContextProvider>['value']>,
            {
                provider: ChatContextClientProviderForTestsOnly,
                value: dummyChatContextClient,
            } satisfies Wrapper<ComponentProps<typeof ChatContextClientProviderForTestsOnly>['value']>,
            {
                component: ConfigProvider,
                props: { value: { authStatus: {} as any, config: {} as any } },
            } satisfies Wrapper<any, ComponentProps<typeof ConfigProvider>>,
        ],
        []
    )
    return <ComposedWrappers wrappers={wrappers}>{children}</ComposedWrappers>
}

const COMMON_WRAPPERS: Wrapper[] = [
    {
        component: TooltipProvider,
        props: { disableHoverableContent: true, delayDuration: 600 },
    } satisfies Wrapper<any, ComponentProps<typeof TooltipProvider>>,
    {
        component: ClientActionListenersContextProvider,
    },
]
