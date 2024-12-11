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
    /**
     * Implements export functionality by checking if the connected instance
     * supports the new events record first - if it does, we use the new
     * API, otherwise we translate the event into the old API and use that
     * instead.
     */
    public async exportEvents(events: TelemetryEventInput[]): Promise<void> {
        const resultOrError = await graphqlClient.recordTelemetryEvents(events)
        if (isError(resultOrError)) {
            logError('GraphQLTelemetryExporter', 'Error exporting telemetry events:', resultOrError)
        }
    }
}
