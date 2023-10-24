import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'

import { VSCodeWrapper } from './VSCodeApi'

/**
 * Create a new {@link TelemetryService} for use in the VS Code webviews.
 */
export function createWebviewTelemetryService(vscodeAPI: VSCodeWrapper): TelemetryService {
    return {
        log: (eventName, eventAction, properties) => {
            vscodeAPI.postMessage({ command: 'event', eventName, properties })
        },
    }
}
