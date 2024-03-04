import {
    type BillingCategory,
    type BillingProduct,
    GraphQLTelemetryExporter,
    graphqlClient,
} from '@sourcegraph/cody-shared'
import {
    type MarketingTrackingProvider,
    MarketingTrackingTelemetryProcessor,
    TelemetryRecorderProvider,
    TestTelemetryExporter,
    TimestampTelemetryProcessor,
    defaultEventRecordingOptions,
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
            process.env.CODY_TELEMETRY_EXPORTER === 'testing'
                ? new TestTelemetryExporter()
                : new GraphQLTelemetryExporter(
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
