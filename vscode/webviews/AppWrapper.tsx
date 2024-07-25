import type { TelemetryRecorder } from '@sourcegraph/cody-shared'
import type { FunctionComponent, ReactNode } from 'react'
import { ClientActionListenersContextProvider, ClientStateContextProvider } from './client/clientState'
import { TooltipProvider } from './components/shadcn/ui/tooltip'
import {
    ChatContextClientProviderForTestsOnly,
    ChatContextClientProviderFromVSCodeAPI,
} from './promptEditor/plugins/atMentions/chatContextClient'
import { dummyChatContextClient } from './promptEditor/plugins/atMentions/fixtures'
import type { VSCodeWrapper } from './utils/VSCodeApi'
import { TelemetryRecorderContext } from './utils/telemetry'

const AppWrapperCommon = ({
    vscodeAPI,
    children,
}: { vscodeAPI: VSCodeWrapper | null; children: ReactNode }): ReactNode => {
    return (
        // (tim): The default delayDuration of 300 felt a little low to go from
        // the left to the right of the panel. I increased it to 600, but any
        // higher feels too "sticky"
        <TooltipProvider disableHoverableContent={true} delayDuration={600}>
            <ClientActionListenersContextProvider>
                <ChatContextClientProviderFromVSCodeAPI vscodeAPI={vscodeAPI}>
                    {children}
                </ChatContextClientProviderFromVSCodeAPI>
            </ClientActionListenersContextProvider>
        </TooltipProvider>
    )
}

/**
 * Wrapper for {@link App} so that we can add more React context providers without requiring big,
 * hard-to-review whitespace diffs in {@link App}.
 */
export const AppWrapper: FunctionComponent<{ vscodeAPI: VSCodeWrapper; children: ReactNode }> =
    AppWrapperCommon

/**
 * For use in tests only.
 */
export const TestAppWrapper: FunctionComponent<{ children: ReactNode }> = ({ children }) => (
    <AppWrapperCommon vscodeAPI={null}>
        <TelemetryRecorderContext.Provider value={NOOP_TELEMETRY_RECORDER}>
            <ClientStateContextProvider value={{ initialContext: [] }}>
                <ChatContextClientProviderForTestsOnly value={dummyChatContextClient}>
                    {children}
                </ChatContextClientProviderForTestsOnly>
            </ClientStateContextProvider>
        </TelemetryRecorderContext.Provider>
    </AppWrapperCommon>
)
const NOOP_TELEMETRY_RECORDER: TelemetryRecorder = {
    recordEvent: () => {},
}
