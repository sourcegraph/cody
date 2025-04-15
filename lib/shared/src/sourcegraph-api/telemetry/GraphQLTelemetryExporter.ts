import type { TelemetryEventInput, TelemetryExporter } from '@sourcegraph/telemetry'

import { logError } from '../../logger'
import { isError } from '../../utils'
import { graphqlClient } from '../graphql/client'

/**
 * GraphQLTelemetryExporter exports events via the new Sourcegraph telemetry
 * framework: https://sourcegraph.com/docs/dev/background-information/telemetry
 *
 * If configured to do so, it will also attempt to send events to the old
 * event-logging mutations if the instance is older than 5.2.0.
 */
export class GraphQLTelemetryExporter implements TelemetryExporter {
    constructor(private readonly allowedDevEvents?: { feature: string; action: string }[]) {}

    private isEventAllowed(event: TelemetryEventInput): boolean {
        if (this.allowedDevEvents === undefined) {
            return true
        }

        return this.allowedDevEvents.some(
            allowed => allowed.feature === event.feature && allowed.action === event.action
        )
    }

    /**
     * Implements export functionality by checking if the connected instance
     * supports the new events record first - if it does, we use the new
     * API, otherwise we translate the event into the old API and use that
     * instead.
     */
    public async exportEvents(events: TelemetryEventInput[]): Promise<void> {
        const allowedEventsToExport = events.filter(event => {
            return this.isEventAllowed(event)
        })

        if (allowedEventsToExport.length === 0) {
            return
        }

        const resultOrError = await graphqlClient.recordTelemetryEvents(allowedEventsToExport)
        if (isError(resultOrError)) {
            logError('GraphQLTelemetryExporter', 'Error exporting telemetry events:', resultOrError)
        }
    }
}
