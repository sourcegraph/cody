import { type ComponentProps, useEffect, useMemo, useState } from 'react'

import type { ContextItem } from '@sourcegraph/cody-shared'
import { LoadingPage } from './LoadingPage'

import { ExtensionAPIProviderFromVSCodeAPI } from '@sourcegraph/prompt-editor'
import { CodyPanel } from './CodyPanel'
import { View } from './tabs'
import type { VSCodeWrapper } from './utils/VSCodeApi'
import { ComposedWrappers, type Wrapper } from './utils/composeWrappers'
import { TelemetryRecorderContext, createWebviewTelemetryRecorder } from './utils/telemetry'
import { LegacyWebviewConfigProvider } from './utils/useLegacyWebviewConfig'

export const App: React.FunctionComponent<{ vscodeAPI: VSCodeWrapper }> = ({ vscodeAPI }) => {
    useEffect(() => {
        // On macOS, suppress the '¬' character emitted by default for alt+L
        const handleKeyDown = (event: KeyboardEvent) => {
            const suppressedKeys = ['¬', 'Ò', '¿', '÷']
            if (event.altKey && suppressedKeys.includes(event.key)) {
                event.preventDefault()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [])

    useEffect(
        () =>
            vscodeAPI.onMessage(message => {
                switch (message.type) {
                    case 'ui/theme': {
                        document.documentElement.dataset.ide = message.agentIDE
                        const rootStyle = document.documentElement.style
                        for (const [name, value] of Object.entries(message.cssVariables || {})) {
                            rootStyle.setProperty(name, value)
                        }
                        break
                    }
                }
            }),
        [vscodeAPI]
    )

    const [view, setView] = useState<View>(View.Chat)

    useEffect(() => {
        vscodeAPI.postMessage({ command: 'initialized' })
    }, [vscodeAPI])

    const wrappers = useMemo<Wrapper[]>(() => getAppWrappers(vscodeAPI, undefined), [vscodeAPI])

    // Wait for all the data to be loaded before rendering Chat View
    if (!view) {
        return <LoadingPage />
    }

    return (
        <ComposedWrappers wrappers={wrappers}>
            <CodyPanel vscodeAPI={vscodeAPI} view={view} setView={setView} />
        </ComposedWrappers>
    )
}

export function getAppWrappers(
    vscodeAPI: VSCodeWrapper,
    staticInitialContext: ContextItem[] | undefined
): Wrapper[] {
    const telemetryRecorder = createWebviewTelemetryRecorder(vscodeAPI)
    return [
        {
            provider: TelemetryRecorderContext.Provider,
            value: telemetryRecorder,
        } satisfies Wrapper<ComponentProps<typeof TelemetryRecorderContext.Provider>['value']>,
        {
            component: LegacyWebviewConfigProvider,
        } satisfies Wrapper<never, ComponentProps<typeof LegacyWebviewConfigProvider>>,
        {
            component: ExtensionAPIProviderFromVSCodeAPI,
            props: { vscodeAPI, staticInitialContext },
        } satisfies Wrapper<any, ComponentProps<typeof ExtensionAPIProviderFromVSCodeAPI>>,
    ]
}
