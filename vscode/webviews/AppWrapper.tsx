import type { TelemetryRecorder } from '@sourcegraph/cody-shared'
import type { FunctionComponent, ReactNode } from 'react'
import { ClientActionListenersContextProvider } from './client/clientState'
import { TooltipProvider } from './components/shadcn/ui/tooltip'
import { TelemetryRecorderContext } from './utils/telemetry'

export const AppWrapper: FunctionComponent<{ children: ReactNode }> = ({ children }) => {
    return (
        <TooltipProvider disableHoverableContent={true} delayDuration={700} skipDelayDuration={1000}>
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
            {children}
        </TelemetryRecorderContext.Provider>
    </AppWrapper>
)
const NOOP_TELEMETRY_RECORDER: TelemetryRecorder = {
    recordEvent: () => {},
}
