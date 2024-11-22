import type { TelemetryRecorder } from '@sourcegraph/cody-shared'

import { createContext, useContext } from 'react'
import type { WebviewRecordEventParameters } from '../../src/chat/protocol'
import type { ApiPostMessage } from '../Chat'
import type { VSCodeWrapper } from './VSCodeApi'

/**
 * Create a new {@link TelemetryRecorder} for use in the VS Code webviews for V2 telemetry.
 * Use either postMessage or VSCodeWrapper to send messages to the VS Code extension.
 */
export function createWebviewTelemetryRecorder(
    postMessage: ApiPostMessage | Pick<VSCodeWrapper, 'postMessage'>
): TelemetryRecorder {
    const actualPostMessage: ApiPostMessage =
        typeof postMessage === 'function' ? postMessage : postMessage.postMessage.bind(postMessage)

    return {
        recordEvent(feature, action, parameters) {
            actualPostMessage({
                command: 'recordEvent',
                feature,
                action,
                // Forcibly cast to almost-identical protocol type
                parameters: parameters as WebviewRecordEventParameters,
            })
        },
    }
}

export const TelemetryRecorderContext = createContext<TelemetryRecorder | null>(null)

export function useTelemetryRecorder(): TelemetryRecorder {
    const telemetryRecorder = useContext(TelemetryRecorderContext)
    if (!telemetryRecorder) {
        throw new Error('no telemetryRecorder')
    }
    return telemetryRecorder
}
