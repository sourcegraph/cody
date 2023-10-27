import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'
import { TelemetryRecorder } from '@sourcegraph/cody-shared/src/telemetry-v2/TelemetryRecorderProvider'

import { VSCodeWrapper } from './VSCodeApi'

/**
 * Create a new {@link TelemetryService} for use in the VS Code webviews.
 */
export function createWebviewTelemetryService(vscodeAPI: VSCodeWrapper): TelemetryService {
    return {
        log: (eventName, properties) => {
            vscodeAPI.postMessage({ command: 'event', eventName, properties })
        },
    }
}

/**
 * Create a new {@link TelemetryRecorder} for use in the VS Code webviews.
 */
export function createWebviewTelemetryRecorder(vscodeAPI: VSCodeWrapper): TelemetryRecorder {
    return {
        recordEvent: (eventName, properties) => {
            vscodeAPI.postMessage({ command: 'event', eventName, properties: { properties } })
        },
    }
}
