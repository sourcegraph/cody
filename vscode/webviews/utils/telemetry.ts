import type { TelemetryRecorder, TelemetryService } from '@sourcegraph/cody-shared'

import type { WebviewRecordEventParameters } from '../../src/chat/protocol'
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
 */
export function createWebviewTelemetryRecorder(vscodeAPI: VSCodeWrapper): TelemetryRecorder {
    return {
        recordEvent(feature, action, parameters) {
            vscodeAPI.postMessage({
                command: 'recordEvent',
                feature,
                action,
                // Forcibly cast to almost-identical protocol type
                parameters: parameters as WebviewRecordEventParameters,
            })
        },
    }
}
