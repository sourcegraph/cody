import { TelemetryService } from '@sourcegraph/cody-shared/src/telemetry'

import { logEvent } from './EventLogger'

export function createVSCodeTelemetryService(): TelemetryService {
    return {
        log(eventName, properties) {
            // eslint-disable-next-line etc/no-deprecated
            logEvent(eventName, properties)
        },
    }
}
