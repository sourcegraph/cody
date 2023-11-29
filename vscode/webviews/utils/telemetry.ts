import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'

import { VSCodeWrapper } from './VSCodeApi'

/**
 * Create a new {@link TelemetryService} for use in the VS Code webviews.
 */
export function createWebviewTelemetryService(vscodeAPI: VSCodeWrapper): TelemetryService {
    return {
        log: (eventName, properties) => {
            vscodeAPI.postMessage({ command: 'event', eventName, properties })
        },
        sync: async (chat, fileLocation) => {
            // no-op - sync currently supports large chat history stored in local storage
            console.log(chat, fileLocation)
            await new Promise(resolve => setTimeout(resolve, 1000))
        },
    }
}
