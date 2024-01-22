import type { TelemetryEventInput, TelemetryExporter } from '@sourcegraph/telemetry'

import { logError } from '../../logger'
import { isError } from '../../utils'

const MOCK_URL = 'http://localhost:49300'
const ENDPOINT = '/.api/mockEventRecording'

/**
 * MockServerTelemetryExporter exports events to a mock endpoint at
 * http://localhost:49300/.api/mockEventRecording
 */
export class MockServerTelemetryExporter implements TelemetryExporter {
    constructor(private anonymousUserID: string) {}

    public async exportEvents(events: TelemetryEventInput[]): Promise<void> {
        const resultOrError = await this.postTestEventRecording(events)
        if (isError(resultOrError)) {
            logError('MockServerTelemetryExporter', 'Error exporting telemetry events:', resultOrError)
        }
    }

    private postTestEventRecording<T>(events: TelemetryEventInput[]): Promise<T | Error> {
        const headers = new Headers({
            'Content-Type': 'application/json',
            'X-Sourcegraph-Actor-Anonymous-UID': this.anonymousUserID,
        })
        return fetch(`${MOCK_URL}${ENDPOINT}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(events),
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP status code: ${response.status}`)
                }
                return response
            })
            .then(response => response.json() as T)
            .catch(
                error =>
                    new Error(`error sending data to mock event-recording API: ${error} (${MOCK_URL})`)
            )
    }
}
