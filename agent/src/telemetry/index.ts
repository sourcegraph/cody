import {
    graphqlClient,
    GraphQLTelemetryExporter,
    type BillingCategory,
    type BillingProduct,
} from '@sourcegraph/cody-shared'
import {
    defaultEventRecordingOptions,
    MarketingTrackingTelemetryProcessor,
    TelemetryRecorderProvider,
    TimestampTelemetryProcessor,
    type MarketingTrackingProvider,
} from '@sourcegraph/telemetry'

import type { ClientInfo } from '../protocol-alias'

/**
 * Default implementation of a TelemetryRecorderProvider for use in the Agent
 * handler only.
 */
export class AgentHandlerTelemetryRecorderProvider extends TelemetryRecorderProvider<
    BillingProduct,
    BillingCategory
> {
    constructor(clientInfo: ClientInfo, marketingTrackingProvider: MarketingTrackingProvider) {
        super(
            {
                client: clientInfo.name,
                clientVersion: clientInfo.version,
            },
            new GraphQLTelemetryExporter(
                graphqlClient,
                clientInfo.extensionConfiguration?.anonymousUserID || '',
                'all'
            ),
            [
                new MarketingTrackingTelemetryProcessor(marketingTrackingProvider),
                // Generate timestamps when recording events, instead of serverside
                new TimestampTelemetryProcessor(),
            ],
            {
                ...defaultEventRecordingOptions,
                bufferTimeMs: 0, // disable buffering for now
            }
        )
    }
}
