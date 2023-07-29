import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'

import { logEvent } from './EventLogger'

export function createVSCodeTelemetryService(): TelemetryService {
    return {
        log(eventName, properties) {
             
            logEvent(eventName, properties)
        },
    }
}
