import type { TelemetryService } from '@sourcegraph/cody-shared'

import type { VSCodeWrapper } from './VSCodeApi'

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
