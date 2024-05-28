import type { TelemetryRecorder, TelemetryService } from '@sourcegraph/cody-shared'

import type { WebviewRecordEventParameters } from '../../src/chat/protocol'
import type { ApiPostMessage } from '../Chat'
import type { VSCodeWrapper } from './VSCodeApi'

/**
 * Create a new {@link TelemetryService} for use in the VS Code webviews.
 *
 * @deprecated Use createWebviewTelemetryRecorder instead.
 */
export function createWebviewTelemetryService(vscodeAPI: VSCodeWrapper): TelemetryService {
    return {
        log: (eventName, properties) => {
            vscodeAPI.postMessage({ command: 'event', eventName, properties })
        },
    }
}

/**
 * Create a new {@link TelemetryRecorder} for use in the VS Code webviews for V2 telemetry.
 * Use either postMessage or VSCodeWrapper to send messages to the VS Code extension.
 */

export function createWebviewTelemetryRecorder(
    postMessage: ApiPostMessage | VSCodeWrapper
): TelemetryRecorder {
    // determine whether we're using the postMessage API or the VSCodeWrapper API and adjust the postMessage function accordingly
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
