import type { TelemetryRecorder } from '@sourcegraph/cody-shared'
import type { FunctionComponent, ReactNode } from 'react'
import { ClientActionListenersContextProvider, ClientStateContextProvider } from './client/clientState'
import { TooltipProvider } from './components/shadcn/ui/tooltip'
import { TelemetryRecorderContext } from './utils/telemetry'

export const AppWrapper: FunctionComponent<{ children: ReactNode }> = ({ children }) => {
    return (
        // (tim): The default delayDuration of 300 felt a little low to go from
        // the left to the right of the panel. I increased it to 600, but any
        // higher feels too "sticky"
        <TooltipProvider disableHoverableContent={true} delayDuration={600}>
            <ClientActionListenersContextProvider>{children}</ClientActionListenersContextProvider>
        </TooltipProvider>
    )
}

/**
 * For use in tests only.
 */
export const TestAppWrapper: FunctionComponent<{ children: ReactNode }> = ({ children }) => (
    <AppWrapper>
        <TelemetryRecorderContext.Provider value={NOOP_TELEMETRY_RECORDER}>
            <ClientStateContextProvider value={{ initialContext: [] }}>
                {children}
            </ClientStateContextProvider>
        </TelemetryRecorderContext.Provider>
    </AppWrapper>
)
const NOOP_TELEMETRY_RECORDER: TelemetryRecorder = {
    recordEvent: () => {},
}
